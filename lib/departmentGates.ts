import { randomInt } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// שער פתיחה/סגירה לכל מחלקה (אגף). נשלט מדף ההגדרות → "הגדרות בקשות".
// כשמחלקה סגורה — הטופס הציבורי, קישורי הטיוטות והמיילים האוטומטיים מתנהגים
// בהתאם (לא מקבלים בקשות חדשות). מאפשר "עליית אוויר" הדרגתית: בשלב ראשון רק
// יולדות פתוח, השאר סגור.
//
// נשמר ב-app_settings תחת מפתח 'department_gates' כ-JSON:
//   { maternity: 'open', gemach: 'closed', financial_aid: 'closed', widows: 'closed' }
// ─────────────────────────────────────────────────────────────────────────────

const GATES_KEY = 'department_gates'

// המחלקות שניתן לפתוח/לסגור. המפתחות תואמים לזרימות הבקשה בפורטל.
// ⚠️ 'holidays' הוא מתג-אב: הוא *מעל* מצב הרישום של החלוקה עצמה. חלוקה יכולה
// להיות פתוחה לרישום ובכל זאת לא תוצג בשום ערוץ אם המתג כאן סגור. כך יש נקודת
// כיבוי אחת לכל המחלקה, בלי לגעת בחלוקות עצמן.
export const GATED_DEPARTMENTS = ['maternity', 'gemach', 'financial_aid', 'widows', 'holidays'] as const
export type GatedDepartment = (typeof GATED_DEPARTMENTS)[number]

export const DEPARTMENT_LABELS: Record<GatedDepartment, string> = {
  maternity: 'עזר יולדות',
  gemach: 'גמ"ח הלוואות',
  financial_aid: 'סיוע רפואי',
  widows: 'אלמנות ויתומים',
  holidays: 'חלוקות חגים',
}

export type DepartmentGates = Record<GatedDepartment, boolean>

// ברירת המחדל של "עליית האוויר": רק יולדות פתוח, כל השאר סגור.
export const DEFAULT_GATES: DepartmentGates = {
  maternity: true,
  gemach: false,
  financial_aid: false,
  widows: false,
  // ⚠️ פתוח כברירת מחדל, ובכוונה: השליטה האמיתית היא registration_open של
  // החלוקה. אילו היה סגור כברירת מחדל, התקנת העדכון הייתה מכבה בשקט ערוץ
  // שעובד — למי שטרם נגע בהגדרות אין רשומה שמורה, והברירה היא שקובעת.
  holidays: true,
}

export type DepartmentOpenings = Partial<Record<GatedDepartment, string>>
export type DepartmentMessages = Partial<Record<GatedDepartment, string>>

// פענוח הערך השמור. פורמט תואם לאחור: מחלקה מחזיקה 'open'/'closed' (או boolean),
// ובנוסף מפתח אופציונלי opens_at: { gemach: '2026-11-10T08:00:00.000Z' } —
// מחלקה סגורה שנפתחת לבד כשהתאריך עבר. אין צורך ב-cron: הפתיחה מחושבת בקריאה.
//
// ⚠️ closed_messages: { gemach: 'לעת עתה אין אפשרות…' } — הודעת סגירה למחלקה.
// מחלקה סגורה *עם* הודעה היא "הקפאה זמנית": היא ממשיכה להופיע באזור האישי,
// ולחיצה עליה מציגה את ההודעה (כמו "הרישום סגור" בחגים). מחלקה סגורה *בלי*
// הודעה נשארת מוסתרת כמו קודם — מחלקה שטרם עלתה לא מוזכרת בשום מקום.
// ההודעה מחליפה את נוסח ברירת המחדל בכל הערוצים: API, מייל וקישורי הטיוטה.
export function resolveGates(raw: string | null | undefined, now: Date = new Date()): {
  gates: DepartmentGates
  opensAt: DepartmentOpenings // רק תאריכים עתידיים של מחלקות שעדיין סגורות
  scheduled: DepartmentOpenings // כל התאריכים השמורים, לעריכה בממשק
  messages: DepartmentMessages // הודעות הסגירה השמורות (גם של מחלקה פתוחה, לעריכה)
} {
  const gates: DepartmentGates = { ...DEFAULT_GATES }
  const opensAt: DepartmentOpenings = {}
  const scheduled: DepartmentOpenings = {}
  const messages: DepartmentMessages = {}
  if (!raw) return { gates, opensAt, scheduled, messages }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const openings = (parsed.opens_at && typeof parsed.opens_at === 'object' ? parsed.opens_at : {}) as Record<string, unknown>
    const texts = (parsed.closed_messages && typeof parsed.closed_messages === 'object' ? parsed.closed_messages : {}) as Record<string, unknown>
    for (const d of GATED_DEPARTMENTS) {
      const msg = texts[d]
      if (typeof msg === 'string' && msg.trim()) messages[d] = msg.trim()
      // תמיכה בשני הפורמטים: boolean או 'open'/'closed'
      const v = parsed[d]
      if (v === true || v === 'open') gates[d] = true
      else if (v === false || v === 'closed') gates[d] = false
      const at = openings[d]
      if (typeof at === 'string' && !Number.isNaN(Date.parse(at))) {
        scheduled[d] = at
        if (!gates[d]) {
          if (Date.parse(at) <= now.getTime()) gates[d] = true
          else opensAt[d] = at
        }
      }
    }
  } catch { /* value אינו JSON — ברירת מחדל */ }
  return { gates, opensAt, scheduled, messages }
}

// הודעות הסגירה שמוצגות לציבור: רק של מחלקות סגורות כרגע.
export function activeClosedMessages(gates: DepartmentGates, messages: DepartmentMessages): DepartmentMessages {
  return Object.fromEntries(GATED_DEPARTMENTS.filter(d => !gates[d] && messages[d]).map(d => [d, messages[d]]))
}

export async function getClosedMessages(admin?: SupabaseClient): Promise<DepartmentMessages> {
  const { gates, messages } = resolveGates(await readGatesRaw(admin))
  return activeClosedMessages(gates, messages)
}

// הערך השמור הגולמי — למי שצריך גם את השערים וגם את ההודעות בקריאה אחת.
export const getDepartmentGatesRaw = (admin?: SupabaseClient) => readGatesRaw(admin)

async function readGatesRaw(admin?: SupabaseClient): Promise<string | null> {
  const client = admin ?? getServiceClient()
  if (!client) return null
  const { data } = await client.from('app_settings').select('value').eq('key', GATES_KEY).maybeSingle()
  return data?.value ?? null
}

// קריאת מצב כל המחלקות (כולל פתיחה אוטומטית שהגיע זמנה). נופל לברירת המחדל אם אין הגדרה שמורה.
export async function getDepartmentGates(admin?: SupabaseClient): Promise<DepartmentGates> {
  return resolveGates(await readGatesRaw(admin)).gates
}

// תאריכי פתיחה אוטומטית. opensAt: עתידיים בלבד (מחלקה סגורה); scheduled: כל השמורים.
export async function getDepartmentOpenings(admin?: SupabaseClient) {
  const { opensAt, scheduled } = resolveGates(await readGatesRaw(admin))
  return { opensAt, scheduled }
}

// האם מחלקה מסוימת פתוחה כרגע.
export async function isDepartmentOpen(dept: GatedDepartment, admin?: SupabaseClient): Promise<boolean> {
  const gates = await getDepartmentGates(admin)
  return gates[dept]
}

// שמירת מצב כל המחלקות (upsert).
export async function saveDepartmentGates(
  admin: SupabaseClient, gates: DepartmentGates, openings: DepartmentOpenings = {}, messages: DepartmentMessages = {},
): Promise<boolean> {
  const { error } = await admin.from('app_settings').upsert(
    { key: GATES_KEY, value: serializeGates(gates, openings, messages), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return !error
}

// הערך השמור. נשמר כ-'open'/'closed' לקריאוּת בבסיס הנתונים; opens_at ו-closed_messages
// רק למחלקות שיש להן ערך.
export function serializeGates(gates: DepartmentGates, openings: DepartmentOpenings = {}, messages: DepartmentMessages = {}): string {
  const obj: Record<string, unknown> = Object.fromEntries(GATED_DEPARTMENTS.map(d => [d, gates[d] ? 'open' : 'closed']))
  const opens = Object.fromEntries(GATED_DEPARTMENTS.filter(d => openings[d]).map(d => [d, openings[d]]))
  if (Object.keys(opens).length) obj.opens_at = opens
  const texts = Object.fromEntries(GATED_DEPARTMENTS.filter(d => messages[d]?.trim()).map(d => [d, messages[d]!.trim()]))
  if (Object.keys(texts).length) obj.closed_messages = texts
  return JSON.stringify(obj)
}

// הודעת "מחלקה סגורה" אחידה — לשימוש ב-API של הבקשות ובטופס.
// עם opensAt (ISO) מוצג גם מתי המחלקה נפתחת. custom — הודעת הסגירה השמורה
// בהגדרות, שמחליפה את נוסח ברירת המחדל.
export function departmentClosedMessage(dept: GatedDepartment, opensAt?: string | null, custom?: string | null): string {
  const text = custom?.trim()
  const base = text || `הגשת בקשות ל${DEPARTMENT_LABELS[dept]} אינה זמינה כעת במערכת.`
  if (opensAt && !Number.isNaN(Date.parse(opensAt))) {
    const when = new Date(opensAt).toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    return `${base} המחלקה תיפתח אוטומטית ב-${when}.${text ? '' : ' לפרטים ניתן לפנות למזכירות.'}`
  }
  return text ? base : `${base} לפרטים ניתן לפנות למזכירות.`
}

// הודעת סגירה: ההודעה השמורה (אם יש) ותאריך הפתיחה המתוכנן (אם יש).
export async function closedMessageFor(dept: GatedDepartment, admin?: SupabaseClient): Promise<string> {
  const { opensAt, messages } = resolveGates(await readGatesRaw(admin))
  return departmentClosedMessage(dept, opensAt[dept], messages[dept])
}

// ─────────────────────────────────────────────────────────────────────────────
// קוד תצוגה מוקדמת — בדיקת מחלקה סגורה "מאחורי הקלעים".
//
// ⚠️ למה זה נדרש: מחלקה סגורה חסומה *בשרת*, ולכן אי אפשר לבדוק את הזרימה
// מקצה לקצה לפני הפתיחה לציבור — בדיוק ברגע שבו הבדיקה הכי חשובה. פתיחה
// זמנית "רק כדי לבדוק" חושפת את הטופס לכל מי שנכנס לאתר באותן דקות.
//
// הקוד מתנהג כמו bypassCode של ההרשמה (ראו lib/registrationGate): מחרוזת
// אקראית שנשמרת ב-app_settings, מועברת ב-?preview=<code>, ומדלגת על השער
// לאותה בקשה בלבד. הוא אינו מדלג על אימות, הרשאות או ולידציה — רק על השער.
// ─────────────────────────────────────────────────────────────────────────────
const PREVIEW_KEY = 'department_preview_code'

/**
 * השערים שיוחזרו לקישור בדיקה תקין.
 *
 * ⚠️ `only` מצמצם למחלקה אחת. בלי צמצום, קישור הבדיקה של הגמ"ח פתח *את כל*
 * המחלקות, והבודק נחת באזור האישי עם יולדות וסיוע רפואי לצדן — כל האפשרויות,
 * במקום זו שהוא בא לבדוק.
 *
 * ⚠️ ערך לא מוכר (שם מחלקה שהשתנה, טעות הקלדה) נופל בכוונה ל"הכל פתוח" ולא
 * ל"הכל סגור": קישור בדיקה שמציג יותר מהנדרש הוא תקלה קוסמטית, וקישור שמציג
 * מסך ריק נראה כמו תקלה במערכת ושולח לחפש באג שאינו קיים.
 */
export function previewGates(only?: string | null): DepartmentGates {
  const scoped = GATED_DEPARTMENTS.includes(only as GatedDepartment) ? (only as GatedDepartment) : null
  return Object.fromEntries(
    GATED_DEPARTMENTS.map(d => [d, scoped ? d === scoped : true]),
  ) as DepartmentGates
}

/** קוד התצוגה המוקדמת הנוכחי. נוצר בפעם הראשונה שמבקשים אותו. */
export async function getDepartmentPreviewCode(admin?: SupabaseClient): Promise<string> {
  const client = admin ?? getServiceClient()
  if (!client) return ''
  const { data } = await client.from('app_settings').select('value').eq('key', PREVIEW_KEY).maybeSingle()
  if (data?.value) return String(data.value)
  return (await regenerateDepartmentPreviewCode(client)) ?? ''
}

/** יצירת קוד חדש (מבטלת מיידית כל קישור שהופץ). */
export async function regenerateDepartmentPreviewCode(admin?: SupabaseClient): Promise<string | null> {
  const client = admin ?? getServiceClient()
  if (!client) return null
  // 24 תווים — ארוך דיו שלא ינוחש, קצר דיו להעתקה נוחה.
  //
  // 🔴 randomInt ולא Math.random: הקוד הזה פותח מחלקות שנסגרו מנהלית, כלומר
  // הוא סוד אבטחה. Math.random ב-V8 הוא xorshift128+ ואינו קריפטוגרפי —
  // תוקף שראה פלט קודם משחזר את מצב המחולל וחוזה את הקוד הבא.
  // ראו את אותו נימוק ב-lib/portalPassword.ts.
  const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
  const code = Array.from({ length: 24 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  const { error } = await client.from('app_settings').upsert(
    { key: PREVIEW_KEY, value: code, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return error ? null : code
}

/**
 * האם המחלקה זמינה לבקשה זו — פתוחה, או סגורה עם קוד תצוגה מוקדמת תקין.
 * ⚠️ השוואה באורך קבוע כדי לא לדלוף את הקוד דרך זמן התגובה.
 */
export async function isDepartmentAccessible(
  dept: GatedDepartment, previewCode?: string | null, admin?: SupabaseClient,
): Promise<boolean> {
  if (await isDepartmentOpen(dept, admin)) return true
  const supplied = (previewCode ?? '').trim()
  if (!supplied) return false
  const expected = await getDepartmentPreviewCode(admin)
  if (!expected || supplied.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
