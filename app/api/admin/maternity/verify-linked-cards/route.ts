import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getNedarimCreds, setMagneticCard, findClientByZeout, getClientCardFull } from '@/lib/nedarim'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 יולדות שרשום אצלנו "שויך כרטיס" ובנדרים הכרטיס לא מופיע אצל הלקוח.
//
// הרקע: לפני תיקון #599 הודעת "כבר משויך"/"משפחה זו" מנדרים נחשבה הצלחה,
// גם כש-נדרים בעצם אמר "אין כרטיסים למשפחה זו".
//
// GET  ?offset=0&limit=40 — דוח קריאה בלבד: לכל רשומה עם card_number נשלפת
//      כרטסת הלקוח מנדרים ונבדק שהכרטיס שם. מחזיר רק את החסרים.
// POST {aid_id, confirm:true} — תיקון רשומה אחת: איתור הלקוח הנכון לפי ת"ז
//      (בעל ואשה), עדכון nedarim_id, שיוך ואימות בכרטסת. אם הכרטיס תפוס
//      אצל משפחה אחרת נדרים יחזיר שגיאה ואנחנו לא נוגעים בכלום, רק מדווחים.
// ─────────────────────────────────────────────────────────────────────────────

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Cards = { MagneticCard?: unknown; CardNumber?: unknown; RemovedDate?: unknown }[]
const activeCards = (full: unknown): Cards => {
  const c = (full as { Cards?: unknown } | null)?.Cards
  return Array.isArray(c) ? (c as Cards).filter(x => !x.RemovedDate) : []
}
const hasCard = (full: unknown, card: string) =>
  activeCards(full).some(c => [c.MagneticCard, c.CardNumber].some(v => digits(v) === card))

const SELECT =
  'id, card_number, status, card_picked_up_at, beneficiary:beneficiaries(id, id_number, spouse_id_number, family_name, spouse_name, nedarim_id)'
type Ben = { id: string; id_number: string | null; spouse_id_number: string | null; family_name: string | null; spouse_name: string | null; nedarim_id: string | null }
const firstBen = (b: unknown): Ben | null => (Array.isArray(b) ? (b[0] ?? null) : (b as Ben | null))

export async function GET(req: NextRequest) {
  const staff = await requirePermission('maternity', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'חיבור נדרים פלוס לא מוגדר' }, { status: 500 })

  const sp = req.nextUrl.searchParams
  const offset = Math.max(0, Number(sp.get('offset')) || 0)
  const limit = Math.min(60, Math.max(1, Number(sp.get('limit')) || 40))

  const { data, count } = await db.from('maternity_aids')
    .select(SELECT, { count: 'exact' })
    .not('card_number', 'is', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)

  const missing: Record<string, unknown>[] = []
  let checked = 0
  for (const r of (data ?? []) as unknown as { id: string; card_number: string; status: string; beneficiary: unknown }[]) {
    const b = firstBen(r.beneficiary)
    const card = digits(r.card_number)
    checked++
    const row = { aidId: r.id, name: [b?.family_name, b?.spouse_name].filter(Boolean).join(' '), idNumber: b?.id_number ?? null, nedarimId: b?.nedarim_id ?? null, cardLast4: card.slice(-4), status: r.status }
    if (!b?.nedarim_id) { missing.push({ ...row, reason: 'אין nedarim_id' }); continue }
    let full: unknown = null
    try { full = await getClientCardFull(creds, String(b.nedarim_id)) } catch { /* נספר כחסר */ }
    if (!full) missing.push({ ...row, reason: 'כרטסת הלקוח לא נשלפה' })
    else if (!hasCard(full, card)) missing.push({ ...row, reason: 'הכרטיס לא רשום אצל הלקוח' })
    await sleep(250)
  }
  return NextResponse.json({
    total: count ?? null, offset, checked, nextOffset: offset + checked < (count ?? 0) ? offset + checked : null,
    missing,
  })
}

export async function POST(req: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const body = await req.json().catch(() => ({})) as { aid_id?: string; confirm?: boolean }
  if (!body.confirm || !body.aid_id) return NextResponse.json({ error: 'נדרש aid_id ו-confirm:true' }, { status: 400 })
  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'חיבור נדרים פלוס לא מוגדר' }, { status: 500 })

  const { data } = await db.from('maternity_aids').select(SELECT).eq('id', body.aid_id).maybeSingle()
  const aid = data as unknown as { id: string; card_number: string | null; beneficiary: unknown } | null
  const b = aid ? firstBen(aid.beneficiary) : null
  const card = digits(aid?.card_number)
  if (!aid || !b || !card) return NextResponse.json({ error: 'רשומה או כרטיס לא נמצאו' }, { status: 404 })

  const before = b.nedarim_id ? String(b.nedarim_id) : null
  // הלקוח הנכון: לפי ת"ז הבעל, ואחריה האשה.
  let target: string | null = null
  for (const z of [b.id_number, b.spouse_id_number].filter(Boolean)) {
    if (target) break
    try { target = await findClientByZeout(creds, String(z)) } catch { /* הבא */ }
  }
  if (!target) return NextResponse.json({ error: 'לא נמצא לקוח בנדרים לפי ת"ז', before }, { status: 422 })

  const r = await setMagneticCard(creds, target, card, { timeoutMs: 15_000 })
  let verified = false
  try { verified = hasCard(await getClientCardFull(creds, target), card) } catch { /* verified=false */ }
  if (!verified) {
    return NextResponse.json({ ok: false, before, target, nedarimMessage: r.message, error: 'הכרטיס לא מופיע בכרטסת אחרי השיוך (ייתכן שהוא תפוס אצל משפחה אחרת). לא שונה דבר אצלנו.' }, { status: 409 })
  }
  if (target !== before) await db.from('beneficiaries').update({ nedarim_id: target }).eq('id', b.id)
  await db.from('maternity_aids').update({ card_load_error: null }).eq('id', aid.id)
  await logActivity(db, { userId: staff.userId, action: 'maternity_card_relinked', entityType: 'maternity_aid', entityId: aid.id, details: { old_nedarim_id: before, new_nedarim_id: target, card_last4: card.slice(-4), nedarimMessage: r.message } })
  return NextResponse.json({ ok: true, before, target, verified: true, nedarimMessage: r.message })
}
