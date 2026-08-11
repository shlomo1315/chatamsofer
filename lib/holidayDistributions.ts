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
  registration_opens_at?: string | null
  registration_closes_at?: string | null
}

/**
 * למה הרישום סגור — לערוצים שרוצים להסביר למשתמש מה קרה ("נסגר אתמול
 * ב-20:00") במקום "אין חלוקה פתוחה".
 *
 * ⚠️ שאילתה נפרדת ולא משתנה-מודול ששומר את הסיבה האחרונה: השרת מטפל בבקשות
 * במקביל (ובגלי רישום — בעשרות בו-זמנית), ומצב משותף ברמת המודול היה מחזיר
 * למשתמש אחד את הסיבה של משתמש אחר. נקראת רק במסלול הכשל, ולכן העלות
 * זניחה — אין כאן שאילתה נוספת במסלול המהיר.
 */
export async function getRegistrationClosedMessage(): Promise<string> {
  const db = getServiceClient()
  if (!db) return 'אין כרגע חלוקה שהרישום אליה פתוח'
  const { data } = await db
    .from('distributions')
    .select('registration_open, registration_opens_at, registration_closes_at')
    .eq('registration_open', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return 'אין כרגע חלוקה שהרישום אליה פתוח'
  const { getScheduleState, closedMessage } = await import('@/lib/distributionSchedule')
  const { registration_open, registration_opens_at, registration_closes_at } =
    data as { registration_open: boolean | null; registration_opens_at: string | null; registration_closes_at: string | null }
  return closedMessage(getScheduleState({ registration_open, registration_opens_at, registration_closes_at }))
}

/**
 * החלוקה שהרישום אליה פתוח כרגע — null כשאין.
 *
 * ⚠️ מתג-האב של המחלקה (הגדרות → שערי מחלקות → "חלוקות חגים") נבדק *כאן*, ולא
 * בכל ערוץ בנפרד: הפורטל, מייל ההטבות, השלוחה הטלפונית וטופס נדרים כולם נגזרים
 * מהפונקציה הזו. סגירה בהגדרות מכבה את כולם בבת אחת, גם אם חלוקה פתוחה לרישום.
 * אכיפה בכל ערוץ בנפרד הייתה מבטיחה שערוץ אחד יישכח.
 */
export async function getOpenDistribution(): Promise<ActiveDistribution | null> {
  const db = getServiceClient()
  if (!db) { console.error('[getOpenDistribution] no service client'); return null }
  const { isDepartmentOpen } = await import('@/lib/departmentGates')
  const deptOpen = await isDepartmentOpen('holidays', db)
  if (!deptOpen) { console.log('[getOpenDistribution] closed=DEPARTMENT_GATE (holidays סגור בהגדרות)'); return null }
  const { data, error } = await db
    .from('distributions')
    .select('id, name, year, amount_per_family, registration_open, registration_opens_at, registration_closes_at')
    .eq('registration_open', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) { console.error('[getOpenDistribution] query error:', error.message); return null }
  if (!data) {
    console.log('[getOpenDistribution] closed=NO_OPEN_DISTRIBUTION (אין חלוקה עם registration_open=true)')
    return null
  }
  const dist = data as ActiveDistribution

  // ⚠️ חלון הרישום המתוזמן — נבדק *כאן*, במקום היחיד שכל הערוצים עוברים בו
  // (פורטל, נדרים, שלוחה טלפונית, מייל ההטבות). אכיפה בכל ערוץ בנפרד הייתה
  // מבטיחה שערוץ אחד יישכח וימשיך לקבל רישומים אחרי הסגירה.
  const { getScheduleState } = await import('@/lib/distributionSchedule')
  const sched = getScheduleState(dist)
  if (!sched.open) {
    console.log(`[getOpenDistribution] closed=SCHEDULE state=${sched.state} at=${sched.at} dist=${dist.id}`)
    return null
  }

  console.log(`[getOpenDistribution] OPEN dist=${dist.id} name=${dist.name}`)
  return dist
}

export interface RegisterResult {
  ok: boolean
  /** נרשם עכשיו (false = היה רשום כבר) */
  created: boolean
  distribution?: ActiveDistribution
  /** תאריך הרישום — הקיים כשכבר רשום, או של הרישום החדש. ISO. */
  registeredAt?: string | null
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
  // ההודעה מסבירה *מה קרה ומתי* — מי שאיחר בשעה צריך לדעת שאיחר, ולא לחשוב
  // שהמערכת תקולה ולהתקשר למשרד.
  if (!dist) return { ok: false, created: false, error: await getRegistrationClosedMessage() }

  const { data: existing } = await db
    .from('distribution_recipients')
    .select('id, registered_at')
    .eq('distribution_id', dist.id)
    .eq('beneficiary_id', beneficiaryId)
    .maybeSingle()
  if (existing) {
    const reg = existing as { registered_at?: string | null }
    return { ok: true, created: false, distribution: dist, registeredAt: reg.registered_at ?? null }
  }

  const now = new Date().toISOString()
  const { error } = await db.from('distribution_recipients').insert({
    distribution_id: dist.id,
    beneficiary_id: beneficiaryId,
    amount: dist.amount_per_family ?? null,
    source,
    phone: opts.phone ?? null,
    registered_at: now,
    status: 'pending',
  })
  if (error) {
    // התנגשות באינדקס הייחודי = נרשם במקביל בערוץ אחר. זו הצלחה, לא כשל.
    // ⚠️ נמשך שוב את התאריך הקיים — כדי שגם במרוץ מקביל נחזיר את תאריך המקור.
    if (String(error.code) === '23505') {
      const { data: race } = await db
        .from('distribution_recipients')
        .select('registered_at')
        .eq('distribution_id', dist.id)
        .eq('beneficiary_id', beneficiaryId)
        .maybeSingle()
      return { ok: true, created: false, distribution: dist, registeredAt: (race as { registered_at?: string | null } | null)?.registered_at ?? null }
    }
    console.error('[holiday] register failed:', error.message)
    return { ok: false, created: false, error: 'הרישום נכשל' }
  }
  return { ok: true, created: true, distribution: dist, registeredAt: now }
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
  const bySource: Record<RegisterSource, number> = { portal: 0, phone: 0, email: 0, nedarim: 0, admin: 0 }
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

