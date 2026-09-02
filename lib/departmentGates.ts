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

// קריאת מצב כל המחלקות. נופל לברירת המחדל אם אין הגדרה שמורה.
export async function getDepartmentGates(admin?: SupabaseClient): Promise<DepartmentGates> {
  const client = admin ?? getServiceClient()
  if (!client) return { ...DEFAULT_GATES }
  const { data } = await client.from('app_settings').select('value').eq('key', GATES_KEY).maybeSingle()
  const gates: DepartmentGates = { ...DEFAULT_GATES }
  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value) as Record<string, unknown>
      for (const d of GATED_DEPARTMENTS) {
        // תמיכה בשני הפורמטים: boolean או 'open'/'closed'
        const v = parsed[d]
        if (v === true || v === 'open') gates[d] = true
        else if (v === false || v === 'closed') gates[d] = false
      }
    } catch { /* value אינו JSON — ברירת מחדל */ }
  }
  return gates
}

// האם מחלקה מסוימת פתוחה כרגע.
export async function isDepartmentOpen(dept: GatedDepartment, admin?: SupabaseClient): Promise<boolean> {
  const gates = await getDepartmentGates(admin)
  return gates[dept]
}

// שמירת מצב כל המחלקות (upsert).
export async function saveDepartmentGates(admin: SupabaseClient, gates: DepartmentGates): Promise<boolean> {
  // נשמר כ-'open'/'closed' לקריאוּת בבסיס הנתונים
  const value = JSON.stringify(
    Object.fromEntries(GATED_DEPARTMENTS.map(d => [d, gates[d] ? 'open' : 'closed'])),
  )
  const { error } = await admin.from('app_settings').upsert(
    { key: GATES_KEY, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return !error
}

// הודעת "מחלקה סגורה" אחידה — לשימוש ב-API של הבקשות ובטופס.
export function departmentClosedMessage(dept: GatedDepartment): string {
  return `הגשת בקשות ל${DEPARTMENT_LABELS[dept]} אינה זמינה כעת במערכת. לפרטים ניתן לפנות למזכירות.`
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
