import { getServiceClient } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// חלוקות חגים — שלב הרישום.
//
// המטרה בשלב הזה אינה לחלק אלא *לדעת מראש*: כמה משפחות נרשמות וכמה כסף להיערך
// לו. לכן הכל נגזר משני נתונים — מספר הנרשמים והסכום למשפחה — ומחושב בזמן אמת,
// בלי טבלת סיכומים שיכולה להיפרד מהמציאות.
//
// ⚠️ הרישום פתוח בחלוקה אחת בכל רגע (אינדקס ייחודי במסד). זה לא מקרי: הערוץ
// הטלפוני מקריא "החלוקה הפעילה", ושתי חלוקות פתוחות היו הופכות אותו לדו-משמעי.
//
// ⚠️ רק מי שקיים במאגר הצאצאים נרשם. הרישום אינו יוצר משפחה חדשה — הוא מקשר
// משפחה קיימת לחלוקה, ולכן בכל שלושת הערוצים נדרש זיהוי (טלפון / ת"ז + קוד).
// ─────────────────────────────────────────────────────────────────────────────

export type { RegisterSource } from '@/lib/distributionSources'
export { SOURCE_LABEL } from '@/lib/distributionSources'
import type { RegisterSource } from '@/lib/distributionSources'

export interface ActiveDistribution {
  id: string
  name: string
  year: string | null
  amount_per_family: number | null
  registration_open: boolean
}

/** החלוקה שהרישום אליה פתוח כרגע — null כשאין. */
export async function getOpenDistribution(): Promise<ActiveDistribution | null> {
  const db = getServiceClient()
  if (!db) return null
  const { data } = await db
    .from('distributions')
    .select('id, name, year, amount_per_family, registration_open')
    .eq('registration_open', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as ActiveDistribution | null) ?? null
}

export interface RegisterResult {
  ok: boolean
  /** נרשם עכשיו (false = היה רשום כבר) */
  created: boolean
  distribution?: ActiveDistribution
  error?: string
}

/**
 * רישום משפחה לחלוקה הפתוחה.
 *
 * ⚠️ רישום כפול אינו שגיאה מבחינת המשתמש: מי שמתקשר פעמיים (או נרשם גם בממשק
 * וגם בטלפון) צריך לשמוע "אתם כבר רשומים" ולא הודעת כשל. במסד זה נאכף באינדקס
 * ייחודי, כדי שגם שתי בקשות במקביל לא ייצרו שתי שורות ולא ינפחו את הצפי.
 */
export async function registerToOpenDistribution(
  beneficiaryId: string,
  source: RegisterSource,
  opts: { phone?: string | null } = {},
): Promise<RegisterResult> {
  const db = getServiceClient()
  if (!db) return { ok: false, created: false, error: 'שגיאת שרת' }

  const dist = await getOpenDistribution()
  if (!dist) return { ok: false, created: false, error: 'אין כרגע חלוקה שהרישום אליה פתוח' }

  const { data: existing } = await db
    .from('distribution_recipients')
    .select('id')
    .eq('distribution_id', dist.id)
    .eq('beneficiary_id', beneficiaryId)
    .maybeSingle()
  if (existing) return { ok: true, created: false, distribution: dist }

  const { error } = await db.from('distribution_recipients').insert({
    distribution_id: dist.id,
    beneficiary_id: beneficiaryId,
    amount: dist.amount_per_family ?? null,
    source,
    phone: opts.phone ?? null,
    registered_at: new Date().toISOString(),
    status: 'pending',
  })
  if (error) {
    // התנגשות באינדקס הייחודי = נרשם במקביל בערוץ אחר. זו הצלחה, לא כשל.
    if (String(error.code) === '23505') return { ok: true, created: false, distribution: dist }
    console.error('[holiday] register failed:', error.message)
    return { ok: false, created: false, error: 'הרישום נכשל' }
  }
  return { ok: true, created: true, distribution: dist }
}

// ─────────────────────────────────────────────────────────────────────────────
// פילוח חי לכל חלוקה — נרשמים, ערוצים, וצפי תקציבי.
// ─────────────────────────────────────────────────────────────────────────────
export interface DistributionStats {
  registered: number
  bySource: Record<RegisterSource, number>
  amountPerFamily: number
  expectedTotal: number
  notified: number
}

export function statsFromRows(
  rows: { source?: string | null; notified_at?: string | null }[],
  amountPerFamily: number | null | undefined,
): DistributionStats {
  const bySource: Record<RegisterSource, number> = { portal: 0, phone: 0, email: 0, admin: 0 }
  let notified = 0
  for (const r of rows) {
    const src = (r.source ?? 'admin') as RegisterSource
    if (src in bySource) bySource[src] += 1
    else bySource.admin += 1
    if (r.notified_at) notified++
  }
  const amount = Number(amountPerFamily ?? 0)
  return {
    registered: rows.length,
    bySource,
    amountPerFamily: amount,
    // ⚠️ הצפי מחושב תמיד מהמספרים העדכניים ולא נשמר: סכום שנשמר פעם אחת מתיישן
    // ברישום הבא, ואז המנהל מתכנן תקציב לפי נתון שאינו נכון.
    expectedTotal: rows.length * amount,
    notified,
  }
}

