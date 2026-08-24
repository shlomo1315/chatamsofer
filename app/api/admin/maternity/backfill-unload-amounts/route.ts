import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getNedarimCreds, getClientCardFull } from '@/lib/nedarim'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// שליפה רטרואקטיבית חד-פעמית: כמה כסף חזר לארנק בפריקות שקדמו לעמודה.
//
// 🔴 card_unloaded_amount נוספה אחרי שכבר בוצעו 13 פריקות, ובהן הסכום
// אבד: card_balance מתאפס ל-0 בפריקה, והיומן לא שמר אותו. נדרים כן
// יודעת מה נפרק מכל תלוש, ולכן אפשר לשחזר.
//
// ⚠️ שני שלבים בכוונה — GET מציג תצוגה מקדימה בלי לכתוב, POST כותב.
// שליפה שמעדכנת מיד היא בלתי הפיכה, וטעות בזיהוי התלוש הייתה כותבת
// סכומים שגויים על נתוני כסף.
//
// 🔒 מנהל בלבד.
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  id: string
  card_tlush_id: string | null
  card_unloaded_at: string | null
  card_unloaded_amount: number | null
  beneficiary?: { nedarim_id: string | null; family_name: string | null; spouse_name: string | null }
    | { nedarim_id: string | null; family_name: string | null; spouse_name: string | null }[]
    | null
}

interface Found {
  aidId: string
  motherName: string
  tlushId: string | null
  unloadedAt: string | null
  /** הסכום שנמצא בנדרים. null = לא נמצא. */
  amount: number | null
  note: string
}

/**
 * מאתר את סכום התלוש בתוך תשובת נדרים.
 *
 * ⚠️ מבנה התשובה אינו מתועד ומשתנה בין גרסאות, ולכן מחפשים בכל מערך
 * שנראה כמו רשימת טעינות ומזהים לפי TlushId. חיפוש לפי מפתח קבוע
 * אחד היה נשבר בשקט ומחזיר null לכולם.
 */
function findTlushAmount(payload: unknown, tlushId: string): number | null {
  if (!payload || typeof payload !== 'object') return null
  const wanted = String(tlushId).trim()
  let hit: number | null = null

  const walk = (node: unknown) => {
    if (hit != null || !node) return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (typeof node !== 'object') return

    const o = node as Record<string, unknown>
    const idVal = o.TlushId ?? o.tlushId ?? o.Id
    if (idVal != null && String(idVal).trim() === wanted) {
      // ⚠️ שמות השדה משתנים; לוקחים את הראשון שהוא מספר תקין.
      for (const k of ['Amount', 'Sum', 'FreeAmount', 'Balance', 'amount', 'sum']) {
        const v = o[k]
        const n = v != null ? Number(v) : NaN
        if (Number.isFinite(n)) { hit = n; return }
      }
    }
    Object.values(o).forEach(walk)
  }

  walk(payload)
  return hit
}

async function collect(): Promise<{ ok: boolean; rows?: Found[]; error?: string }> {
  const creds = await getNedarimCreds()
  if (!creds) return { ok: false, error: 'חיבור נדרים פלוס לא מוגדר' }

  const db = getServiceClient()
  if (!db) return { ok: false, error: 'שגיאת שרת' }

  const { data, error } = await db
    .from('maternity_aids')
    .select('id, card_tlush_id, card_unloaded_at, card_unloaded_amount, beneficiary:beneficiaries(nedarim_id, family_name, spouse_name)')
    .not('card_unloaded_at', 'is', null)
    .is('card_unloaded_amount', null)
    .order('card_unloaded_at', { ascending: false })

  if (error) return { ok: false, error: error.message }

  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

  // ⚠️ תשובת נדרים נשמרת במטמון לפי מזהה משפחה: לכמה תיקים אותה משפחה,
  // וקריאה חוזרת על כל תיק הייתה מכפילה את הפניות ל-API החיצוני.
  const cache = new Map<string, unknown>()
  const out: Found[] = []

  for (const r of (data ?? []) as Row[]) {
    const b = one(r.beneficiary)
    const motherName = [b?.family_name, b?.spouse_name].filter(Boolean).join(' ') || '—'
    const nedarimId = (b?.nedarim_id ?? '').trim()
    const tlush = (r.card_tlush_id ?? '').trim()

    if (!nedarimId || !tlush) {
      out.push({ aidId: r.id, motherName, tlushId: tlush || null,
        unloadedAt: r.card_unloaded_at, amount: null,
        note: !nedarimId ? 'אין מזהה נדרים' : 'אין מספר תלוש' })
      continue
    }

    try {
      if (!cache.has(nedarimId)) {
        cache.set(nedarimId, await getClientCardFull(creds, nedarimId))
      }
      const payload = cache.get(nedarimId)
      const amount = findTlushAmount(payload, tlush)
      out.push({ aidId: r.id, motherName, tlushId: tlush,
        unloadedAt: r.card_unloaded_at, amount,
        note: amount != null ? 'נמצא בנדרים' : 'התלוש לא נמצא בהיסטוריה' })
    } catch (e) {
      out.push({ aidId: r.id, motherName, tlushId: tlush,
        unloadedAt: r.card_unloaded_at, amount: null,
        note: `שגיאה: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  return { ok: true, rows: out }
}

/** GET — תצוגה מקדימה בלבד. אינו כותב דבר. */
export async function GET() {
  if (!(await requireAdmin())) return forbidden('שליפה רטרואקטיבית שמורה למנהל')

  const res = await collect()
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })

  const rows = res.rows ?? []
  const found = rows.filter(r => r.amount != null)
  return NextResponse.json({
    preview: true,
    rows,
    summary: {
      total: rows.length,
      found: found.length,
      missing: rows.length - found.length,
      sum: found.reduce((s, r) => s + (r.amount ?? 0), 0),
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/** POST — כותב את הסכומים שנמצאו. */
export async function POST(request: NextRequest) {
  void request
  const staff = await requireAdmin()
  if (!staff) return forbidden('שליפה רטרואקטיבית שמורה למנהל')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const res = await collect()
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })

  const rows = (res.rows ?? []).filter(r => r.amount != null)
  let updated = 0
  for (const r of rows) {
    const { error } = await db.from('maternity_aids')
      .update({ card_unloaded_amount: r.amount })
      .eq('id', r.aidId)
    if (!error) updated++
  }

  await logActivity(db, {
    userId: staff.userId,
    action: 'unload_amounts_backfilled',
    entityType: 'maternity_aid',
    details: { updated, attempted: rows.length },
  })

  return NextResponse.json({ ok: true, updated, attempted: rows.length })
}
