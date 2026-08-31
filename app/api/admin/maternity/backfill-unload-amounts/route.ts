import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getNedarimCreds, getClientCardFull } from '@/lib/nedarim'
import { parseNedarimAmount } from '@/lib/nedarimAmount'
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
 * מאתר את סכום הפריקה בתשובת נדרים.
 *
 * 🔴 המבנה אומת מול תשובה אמיתית (26.08) ואינו מנוחש עוד:
 *
 *   History: [
 *     { HistoryId: '3651412', Date: '25/08/26 00:12',
 *       Amount: '0.21', Comments: 'פריקת תלוש ע"י הקופה' },
 *     { StoreName: 'שובע שמחות', Amount: '9.94', Comments: '' },   ← קנייה
 *     ...
 *   ]
 *
 * ⚠️ הפריקה יושבת ב-History ולא ב-Tlushim. הניסיון הראשון חיפש
 * Amount על התלוש — שם יושב סכום ה*טעינה* (600) — וכתב אותו כ"סכום
 * שחזר" ל-13 פריקות. משפחה שנשארו לה 0.21 נרשמה כאילו חזרו 600.
 *
 * ⚠️ הזיהוי לפי Comments בלבד: לשורות הקנייה יש StoreName ו-Comments
 * ריק, ולשורת הפריקה יש Comments מפורש ואין חנות. אין שדה סוג.
 *
 * ⚠️ TlushId אינו קיים בשורות ה-History — יש בהן HistoryId משלהן.
 * לכן אי אפשר לשייך פריקה לתלוש מסוים, ונלקחת הפריקה האחרונה. זה
 * נכון כל עוד למשפחה תלוש פעיל אחד, וזה המצב בכל 14 הרשומות.
 */
function findUnloadAmount(payload: unknown): number | null {
  const p = payload as { History?: unknown } | null
  const history = Array.isArray(p?.History) ? p.History : []

  // ⚠️ מהחדש לישן — נדרים מחזירה בסדר יורד, והפריקה האחרונה היא
  // הרלוונטית.
  for (const raw of history) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const comments = String(row.Comments ?? '')
    if (!/פריקת תלוש/.test(comments)) continue

    // ⚠️ Amount מגיע כמחרוזת ולעתים עם ' ₪' — החילוץ מרוכז
    // ב-parseNedarimAmount. כאן ישבה שגיאת מחלקה שמחקה את הספרות
    // עצמן ([^d.-] בלי לוכסן), וזו הסיבה שהעמודה נשארה ריקה.
    const n = parseNedarimAmount(row.Amount)
    if (n != null) return n
  }
  return null
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
      const amount = findUnloadAmount(payload)
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
