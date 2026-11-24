import type { SupabaseClient } from '@supabase/supabase-js'
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
import { getDistRules, channelAllowed, blockedByDeepReview, phoneOnlyMessage, isTestCaller } from '@/lib/holidayDistRules'
import { isDistributionEnabled, firstEnabled } from '@/lib/distributionEnabled'

export interface ActiveDistribution {
  id: string
  name: string
  year: string | null
  amount_per_family: number | null
  registration_open: boolean
  /** 🔴 רישום בטלפון בלבד (holidayDistRules). כל ערוץ אחר מציג הודעה ואינו רושם. */
  phone_only?: boolean
  /** מספר הקו להצגה למשפחות כשהרישום בטלפון בלבד. */
  phone_number?: string
}

/** מספר הקו הראשי (טכנוליין) מהסביבה — לתצוגה בלבד. */
function defaultPhoneNumber(): string {
  return (process.env.TECHNOLINE_MAIN_NUMBER || process.env.HOLIDAY_PHONE_NUMBER || '').trim()
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
  if (await isRegistrationDeadlinePassed(db)) { console.log('[getOpenDistribution] closed=DEADLINE (מועד הסגירה עבר)'); return null }
  // ⚠️ '*' ולא רשימת עמודות — ראו lib/distributionEnabled.ts.
  const { data, error } = await db
    .from('distributions')
    .select('*')
    .eq('registration_open', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) { console.error('[getOpenDistribution] query error:', error.message); return null }
  if (!data) { console.log('[getOpenDistribution] closed=NO_OPEN_DISTRIBUTION (אין חלוקה עם registration_open=true)'); return null }
  // 🔴 חלוקה מושבתת אינה קיימת מבחינת אף ערוץ, גם כשהרישום אליה מסומן פתוח.
  if (!isDistributionEnabled(data)) { console.log(`[getOpenDistribution] closed=DISABLED dist=${data.id}`); return null }
  const { id, name, year, amount_per_family, registration_open } = data as ActiveDistribution
  const dist: ActiveDistribution = { id, name, year, amount_per_family, registration_open }
  console.log(`[getOpenDistribution] OPEN dist=${dist.id} name=${dist.name}`)
  const rules = await getDistRules(dist.id)
  return { ...dist, phone_only: rules.phoneOnly, phone_number: rules.phoneNumber || defaultPhoneNumber() }
}

/**
 * 🔴 מועד סגירת הרישום (הגדרות → שיתוף חלוקות חגים) עבר — הרישום סגור בכל
 * הערוצים, גם כש-registration_open עדיין דלוק. ראו lib/distributionsShareScope.
 */
export async function isRegistrationDeadlinePassed(db: SupabaseClient | null = getServiceClient()): Promise<boolean> {
  if (!db) return false
  const { getClosesAt, isPastClosesAt } = await import('@/lib/distributionsShareScope')
  return isPastClosesAt(await getClosesAt(db))
}

export interface RegisterResult {
  ok: boolean
  /** נרשם עכשיו (false = היה רשום כבר) */
  created: boolean
  distribution?: ActiveDistribution
  /** תאריך הרישום — הקיים כשכבר רשום, או של הרישום החדש. ISO. */
  registeredAt?: string | null
  error?: string
  /** 🔴 נדחה כי הרישום לחלוקה זו בטלפון בלבד. */
  phoneOnly?: boolean
  /** נדחה כי המשפחה בבדיקה מעמיקה והחלוקה חוסמת זאת. */
  deepReview?: boolean
  /** מזהה השורה בטבלת הנרשמים (חדשה או קיימת). */
  recipientId?: string
  /** האם השורה מאושרת (אישור אוטומטי ברישום הטלפוני, או אושרה קודם). */
  approved?: boolean
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
  opts: {
    phone?: string | null
    /** 🧪 רישום מספר ניסיון לחלוקה שהרישום אליה עדיין סגור (testDistributionFor). */
    distribution?: ActiveDistribution | null
  } = {},
): Promise<RegisterResult> {
  const db = getServiceClient()
  if (!db) return { ok: false, created: false, error: 'שגיאת שרת' }

  const dist = opts.distribution ?? await getOpenDistribution()
  if (!dist) return { ok: false, created: false, error: 'אין כרגע חלוקה שהרישום אליה פתוח' }

  // 🔴 כללי החלוקה: "בטלפון בלבד" ו"חסימת בדיקה מעמיקה". נאכפים כאן ולא
  // בכל ערוץ, כדי שאף ערוץ (גם עתידי) לא יעקוף אותם.
  const rules = await getDistRules(dist.id)
  const distName = `${dist.name}${dist.year ? ` ${dist.year}` : ''}`
  if (!channelAllowed(rules, source)) {
    console.log(`[holiday] register refused PHONE_ONLY dist=${dist.id} source=${source}`)
    return { ok: false, created: false, phoneOnly: true, error: phoneOnlyMessage(distName, dist.phone_number ?? '') }
  }

  const { data: existing } = await db
    .from('distribution_recipients')
    .select('id, registered_at, approval_status')
    .eq('distribution_id', dist.id)
    .eq('beneficiary_id', beneficiaryId)
    .maybeSingle()
  if (existing) {
    const reg = existing as { id: string; registered_at?: string | null; approval_status?: string | null }
    return {
      ok: true, created: false, distribution: dist, registeredAt: reg.registered_at ?? null,
      recipientId: reg.id, approved: reg.approval_status === 'approved',
    }
  }

  if (rules.blockDeepReview) {
    const { data: ben } = await db.from('beneficiaries').select('eligibility_status').eq('id', beneficiaryId).maybeSingle()
    if (blockedByDeepReview(rules, (ben as { eligibility_status?: string | null } | null)?.eligibility_status)) {
      console.log(`[holiday] register refused DEEP_REVIEW dist=${dist.id} ben=${beneficiaryId}`)
      return { ok: false, created: false, deepReview: true, error: 'לא ניתן להשלים את הרישום כעת. לפרטים נא לפנות למשרד.' }
    }
  }

  // ⚠️ אישור אוטומטי רק לרישום הטלפוני, שעבר את כל שאלות הזיהוי וההצהרה.
  const approve = rules.autoApprove && source === 'phone'
  const now = new Date().toISOString()
  const { data: inserted, error } = await db.from('distribution_recipients').insert({
    distribution_id: dist.id,
    beneficiary_id: beneficiaryId,
    amount: dist.amount_per_family ?? null,
    source,
    phone: opts.phone ?? null,
    registered_at: now,
    status: 'pending',
    ...(approve ? { approval_status: 'approved' } : {}),
  }).select('id').maybeSingle()
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
  return {
    ok: true, created: true, distribution: dist, registeredAt: now,
    recipientId: (inserted as { id?: string } | null)?.id, approved: approve,
  }
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


/**
 * החלוקה הפעילה — גם כשהרישום סגור.
 *
 * 🔴 getOpenDistribution מחזיר null ברגע שהרישום נסגר, וכל המידע נזרק.
 * התוצאה: מי שנכנס לקישור החלוקה אחרי הסגירה לא ראה דבר — גם אם הוא
 * *כבר רשום*, וגם כשפתחנו לו בחירת מוקד. שלב הבחירה והחלוקה עצמה
 * מתרחשים אחרי שהרישום נסגר, וזה בדיוק החלון שבו המשפחה זקוקה למידע.
 *
 * ⚠️ status='cancelled' הוא הכיבוי המוחלט — אז אין חלוקה כלל.
 * שאר הסטטוסים נחשבים פעילים.
 */
export interface LiveDistribution extends ActiveDistribution {
  centers_open: boolean
  status: string
}

export async function getLiveDistribution(): Promise<LiveDistribution | null> {
  const db = getServiceClient()
  if (!db) return null
  // 🔴 חלוקה מושבתת מדולגת, כאילו אינה קיימת: "החיה" היא האחרונה שפעילה.
  const { data } = await db
    .from('distributions')
    .select('*')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(20)
  const row = firstEnabled(data as LiveDistribution[] | null)
  if (!row) return null
  const { id, name, year, amount_per_family, registration_open, centers_open, status } = row
  return { id, name, year, amount_per_family, registration_open, centers_open, status }
}

/**
 * 🧪 חלוקה לניסיון: כשהרישום סגור, מתקשר ממספר ניסיון של החלוקה האחרונה
 * (לא מבוטלת) מקבל אותה כאילו היא פתוחה ו"בטלפון בלבד".
 *
 * ⚠️ רק כשאין חלוקה פתוחה: כשהרישום פתוח כולם עוברים במסלול הרגיל.
 */
export async function testDistributionFor(callerPhone: string | null | undefined): Promise<ActiveDistribution | null> {
  if (!callerPhone) return null
  const live = await getLiveDistribution()
  if (!live) return null
  const rules = await getDistRules(live.id)
  if (!isTestCaller(rules, callerPhone)) return null
  console.log(`[holiday] TEST caller allowed dist=${live.id}`)
  return {
    id: live.id, name: live.name, year: live.year, amount_per_family: live.amount_per_family,
    registration_open: true, phone_only: true, phone_number: rules.phoneNumber || defaultPhoneNumber(),
  }
}
