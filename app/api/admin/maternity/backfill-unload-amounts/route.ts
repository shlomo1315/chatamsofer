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
 * מאתר את סכום ה*פריקה* בתוך תשובת נדרים.
 *
 * 🔴 לא סכום הטעינה. הניסיון הראשון חיפש שדה Amount כלשהו על התלוש
 * והחזיר 600 לכל אחת מ-13 הפריקות — סכום הטעינה, לא מה שחזר בפועל.
 * משפחה שקנתה ב-599.79 ונשארו לה 0.21 נרשמה כאילו חזרו 600.
 *
 * ⚠️ בנדרים הפריקה היא *תנועה נפרדת* בהיסטוריה, עם תיאור "פריקת תלוש".
 * זו השורה שמחפשים כאן — לא את התלוש עצמו.
 *
 * ⚠️ המבנה אינו מתועד ומשתנה, ולכן החיפוש עובר על כל האובייקטים ומזהה
 * לפי הטקסט. אין כאן ניחוש: אם לא נמצאה שורת פריקה — מוחזר null.
 */
function findUnloadAmount(payload: unknown, tlushId: string): number | null {
  if (!payload || typeof payload !== 'object') return null
  const wanted = String(tlushId).trim()
  let hit: number | null = null

  const walk = (node: unknown) => {
    if (hit != null || !node) return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (typeof node !== 'object') return

    const o = node as Record<string, unknown>

    // תיאור התנועה — כאן מזוהה הפריקה
    const desc = String(o.Description ?? o.Comment ?? o.Details ?? o.Name ?? o.Product ?? '')
    const isUnloadRow = /פריק/.test(desc)

    if (isUnloadRow) {
      // ⚠️ מוודאים שזו הפריקה של *התלוש הזה* ולא של אחר לאותה משפחה:
      // למשפחה עם כמה לידות יש כמה תלושים.
      const idVal = String(o.TlushId ?? o.tlushId ?? o.Id ?? '').trim()
      if (!wanted || !idVal || idVal === wanted) {
        for (const k of ['Amount', 'Sum', 'Total', 'amount', 'sum']) {
          const v = o[k]
          const n = v != null ? Number(v) : NaN
          if (Number.isFinite(n)) { hit = Math.abs(n); return }
        }
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
      const amount = findUnloadAmount(payload, tlush)
      out.push({ aidId: r.id, motherName, tlushId: tlush,
        unloadedAt: r.card_unloaded_at, amount,
        note: amount != null ? 'נמצא בנדרים' : 'שורת הפריקה לא נמצאה בהיסטוריה' })
    } catch (e) {
      out.push({ aidId: r.id, motherName, tlushId: tlush,
        unloadedAt: r.card_unloaded_at, amount: null,
        note: `שגיאה: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  return { ok: true, rows: out }
}

/**
 * GET — תצוגה מקדימה בלבד. אינו כותב דבר.
 *
 * ⚠️ ?raw=1 מחזיר את תשובת נדרים הגולמית למשפחה אחת.
 *
 * 🔴 למה זה קיים: הניסיון הראשון ניחש את מבנה התשובה, מצא שדה Amount
 * על תלוש הטעינה, וכתב 600 לכל 13 הפריקות — מספר שנראה מדויק והיה
 * שגוי לחלוטין. המבנה אינו מתועד, ולכן צריך לראות אותו לפני שכותבים.
 */
export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return forbidden('שליפה רטרואקטיבית שמורה למנהל')

  // ── מצב אבחון ──
  if (request.nextUrl.searchParams.get('raw') === '1') {
    const creds = await getNedarimCreds()
    if (!creds) return NextResponse.json({ error: 'חיבור נדרים לא מוגדר' }, { status: 500 })
    const db = getServiceClient()
    if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

    const { data } = await db.from('maternity_aids')
      .select('card_tlush_id, beneficiary:beneficiaries(nedarim_id, family_name)')
      .not('card_unloaded_at', 'is', null).is('card_unloaded_amount', null)
      .limit(1).maybeSingle()

    const row = data as { card_tlush_id?: string; beneficiary?: unknown } | null
    const b = Array.isArray(row?.beneficiary) ? row?.beneficiary[0] : row?.beneficiary
    const nedId = (b as { nedarim_id?: string } | null)?.nedarim_id
    if (!nedId) return NextResponse.json({ error: 'לא נמצאה משפחה לבדיקה' }, { status: 404 })

    const payload = await getClientCardFull(creds, String(nedId))
    return NextResponse.json({
      diagnostic: true,
      family: (b as { family_name?: string } | null)?.family_name,
      tlushId: row?.card_tlush_id,
      // ⚠️ התשובה המלאה — כדי לראות איפה באמת יושב סכום הפריקה.
      payload,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

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
