import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import {
  getNedarimCreds, setMagneticCard, findClientByZeout, getClientCardFull,
} from '@/lib/nedarim'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 תיקון יולדות שהכרטיס שלהן לא שויך כי מזהה נדרים השמור אצלנו מת.
//
// הרקע: הכסף נטען (card_load_status='loaded'), אבל שיוך הכרטיס הפיזי למשפחה
// בנדרים נכשל ב"מספר לקוח לא מוכר" — המזהה שאנחנו מחזיקים נמחק או מוזג אצלם.
// המשפחה מחזיקה כרטיס טעון שאי אפשר להפעיל, ובכל שיחה חוזרת היא שומעת את
// אותה שגיאה.
//
// ⚠️ התיקון בשלוחה (yemot-maternity) פותר את זה *בשיחה הבאה*. הכלי הזה סוגר
// את הפער לאחור, כדי שהמשפחות התקועות לא יידרשו לחייג שוב ולקוות.
//
// 🔴 אינו נוגע בכסף: אין כאן טעינה, אין ניכוי מלאי ואין החזרה. רק שיוך
// הכרטיס בנדרים ועדכון nedarim_id אצלנו.
//
// ⚠️ מסומן card_picked_up_at רק כשהוא ריק — התיקון אינו "איסוף" חדש ואינו
// אמור להזיז את מונה הממתינים במוקד פעמיים.
//
// GET  — מי תקוע ומה הסיבה (בלי לגעת).
// POST — תיקון בפועל. דורש confirm:true.
// ─────────────────────────────────────────────────────────────────────────────

/** ⚠️ רק כשל *זיהוי הלקוח*. "מספר כרטיס לא תקין" הוא תקלה אחרת לגמרי
 *  (כרטיס מסדרה שאינה של המוסד) ואין לו מה לעשות כאן. */
const DEAD_CLIENT_ERROR = /לא מוכר|לא נמצא|not found/i

interface Row {
  id: string
  card_number: string | null
  card_load_error: string | null
  card_picked_up_at: string | null
  beneficiary_id: string | null
  beneficiary?: {
    id?: string
    id_number?: string | null
    spouse_id_number?: string | null
    family_name?: string | null
    spouse_name?: string | null
    nedarim_id?: string | null
  } | {
    id?: string
    id_number?: string | null
    spouse_id_number?: string | null
    family_name?: string | null
    spouse_name?: string | null
    nedarim_id?: string | null
  }[] | null
}

const SELECT =
  'id, card_number, card_load_error, card_picked_up_at, beneficiary_id, ' +
  'beneficiary:beneficiaries(id, id_number, spouse_id_number, family_name, spouse_name, nedarim_id)'

/** ⚠️ Supabase מחזיר join כמערך או כאובייקט — שתי הצורות נתמכות. */
const firstBen = (b: Row['beneficiary']) => (Array.isArray(b) ? (b[0] ?? null) : b)

async function listStuck(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { data } = await db.from('maternity_aids')
    .select(SELECT)
    // 🔴 רק מי שהכסף שלה כבר יצא: התיקון נועד לכרטיס טעון שאי אפשר להפעיל.
    .eq('card_load_status', 'loaded')
    .is('card_unloaded_at', null)
    .not('card_load_error', 'is', null)
  const rows = (data ?? []) as unknown as Row[]
  return rows.filter(r => DEAD_CLIENT_ERROR.test(r.card_load_error ?? ''))
}

export async function GET() {
  const staff = await requirePermission('maternity', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const stuck = await listStuck(db)
  return NextResponse.json({
    stuck: stuck.length,
    rows: stuck.map(r => {
      const b = firstBen(r.beneficiary)
      return {
        aidId: r.id,
        name: [b?.family_name, b?.spouse_name].filter(Boolean).join(' '),
        idNumber: b?.id_number ?? null,
        nedarimId: b?.nedarim_id ?? null,
        cardNumber: r.card_number,
        error: r.card_load_error,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as { confirm?: boolean; aid_ids?: string[] }
  // 🔴 שער אישור — קריאה מקרית לא תפנה לנדרים על עשרות משפחות.
  if (!body.confirm) return NextResponse.json({ error: 'נדרש אישור מפורש' }, { status: 400 })

  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'חיבור נדרים פלוס לא מוגדר' }, { status: 500 })

  let stuck = await listStuck(db)
  if (body.aid_ids?.length) stuck = stuck.filter(r => body.aid_ids!.includes(r.id))

  const fixed: Record<string, unknown>[] = []
  const failed: Record<string, unknown>[] = []

  for (const r of stuck) {
    const b = firstBen(r.beneficiary)
    const name = [b?.family_name, b?.spouse_name].filter(Boolean).join(' ')
    const card = (r.card_number ?? '').replace(/\D/g, '')
    if (!card) { failed.push({ aidId: r.id, name, reason: 'אין מספר כרטיס ברשומה' }); continue }

    // ── איתור המשפחה מחדש — לפי שתי הת"ז ──
    // ⚠️ המשפחה בנדרים עשויה להיות רשומה על שם בן/בת הזוג; חיפוש לפי אחת
    // בלבד מחזיר null על משפחה שקיימת.
    let fresh: string | null = null
    for (const cand of [b?.id_number, b?.spouse_id_number].filter(Boolean)) {
      if (fresh) break
      try { fresh = await findClientByZeout(creds, String(cand)) } catch { /* למועמד הבא */ }
    }
    if (!fresh) {
      failed.push({ aidId: r.id, name, idNumber: b?.id_number, reason: 'המשפחה לא אותרה בנדרים — טיפול ידני' })
      continue
    }

    // ── שיוך הכרטיס למזהה החדש ──
    let ok = false, msg = ''
    try {
      const res = await setMagneticCard(creds, fresh, card, { timeoutMs: 15_000 })
      ok = res.ok; msg = res.message
    } catch (e) { msg = e instanceof Error ? e.message : String(e) }

    // ⚠️ נדרים לעיתים מקשרת ומחזירה שגיאה — מאמתים בשליפה חוזרת לפני שמדווחים כשל.
    if (!ok) {
      try {
        const full = await getClientCardFull(creds, fresh)
        const cards = Array.isArray((full as { Cards?: unknown } | null)?.Cards)
          ? (full as { Cards: Record<string, unknown>[] }).Cards : []
        ok = cards.some(c => !c.RemovedDate
          && [c.MagneticCard, c.CardNumber].some(v => String(v ?? '').replace(/\D/g, '') === card))
      } catch { /* נשאר כשל */ }
    }

    if (!ok) { failed.push({ aidId: r.id, name, nedarimId: fresh, reason: msg || 'השיוך נדחה' }); continue }

    // ── הצלחה: שומרים את המזהה החדש ומנקים את השגיאה ──
    if (b?.id && fresh !== b?.nedarim_id) {
      await db.from('beneficiaries').update({ nedarim_id: fresh }).eq('id', b.id)
    }
    // ⚠️ card_picked_up_at רק אם ריק: התיקון אינו איסוף חדש, ודריסתו הייתה
    // משנה את תאריך האיסוף האמיתי במשפחות שכן אספו.
    const patch: Record<string, unknown> = { card_load_error: null }
    if (!r.card_picked_up_at) patch.card_picked_up_at = new Date().toISOString()
    await db.from('maternity_aids').update(patch).eq('id', r.id)

    await logActivity(db, {
      userId: staff.userId,
      action: 'maternity_card_relinked',
      entityType: 'maternity_aid',
      entityId: r.id,
      details: { name, old_nedarim_id: b?.nedarim_id ?? null, new_nedarim_id: fresh, card_last4: card.slice(-4) },
    })
    fixed.push({ aidId: r.id, name, oldNedarimId: b?.nedarim_id ?? null, newNedarimId: fresh })

    // ⚠️ קצב מבוקר — נדרים חוסמת קריאות רצופות.
    await new Promise(res => setTimeout(res, 150))
  }

  console.log(`[relink-dead-nedarim] תוקנו ${fixed.length} · נכשלו ${failed.length}`)
  return NextResponse.json({ ok: true, attempted: stuck.length, fixed: fixed.length, failed: failed.length, fixedList: fixed, failedList: failed })
}
