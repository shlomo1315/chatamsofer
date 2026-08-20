// ─────────────────────────────────────────────────────────────────────────────
// בחירת מוקד חלוקה — הכללים המשותפים לטלפון ולממשק הדיגיטלי.
//
// 🔴 פונקציה טהורה אחת ששני הערוצים עוברים דרכה. שני ערוצים שכל אחד אוכף
// כללים משלו נפרדים זה מזה ברגע שמשנים אחד מהם, והמשפחה מגלה שהטלפון
// מאפשר בדיוק את מה שהמסך חוסם.
//
// ⚠️ אין כאן גישה למסד. הקורא שולף את המצב ומעביר אותו; כך אפשר לבדוק
// את כל הכללים בלי מסד ובלי שלוחה.
// ─────────────────────────────────────────────────────────────────────────────

export const REGIONS = {
  jerusalem: 'ירושלים והסביבה',
  center: 'מרכז',
  north: 'צפון',
  south: 'דרום',
} as const

export type RegionKey = keyof typeof REGIONS

export interface CenterRow {
  id: string
  city: string
  name: string
  region: string
  sort_order: number
}

/** המצב שנדרש להכרעה — נשלף פעם אחת ומועבר לכאן. */
export interface PickState {
  /** מתג בחירת המוקדים בחלוקה. ⚠️ עצמאי משער הרישום. */
  centersOpen: boolean
  /** המוקד שכבר נבחר, אם נבחר. */
  currentCenterId: string | null
  centerExists: boolean
  centerIsOpenInDistribution: boolean
  centerTaken: number
  /** null = ללא הגבלה. */
  centerCapacity: number | null
}

export type PickResult =
  | { ok: true }
  | { ok: false; reason: 'closed' | 'locked' | 'full' | 'not_found' }

/**
 * מכריע אם מותר לבחור את המוקד.
 *
 * סדר הבדיקות אינו שרירותי:
 *   1. מתג סגור  — אין מה לדון בו כלל
 *   2. נעילה     — ⚠️ גוברת על התקרה: מי שכבר בחר מוקד שהתמלא נשאר בו
 *   3. קיום      — לפני התקרה, שאם לא כן "מלא" יוחזר על מוקד שאינו קיים
 *   4. תקרה
 */
export function evaluatePick(state: PickState, targetCenterId?: string): PickResult {
  if (!state.centersOpen) return { ok: false, reason: 'closed' }

  // ⚠️ בחירה חוזרת באותו מוקד אינה שגיאה — הקשה כפולה בטלפון שכיחה,
  // ו"כבר בחרת בזה" הוא כישלון מיותר שמבלבל.
  if (state.currentCenterId && state.currentCenterId !== targetCenterId) {
    return { ok: false, reason: 'locked' }
  }

  if (!state.centerExists || !state.centerIsOpenInDistribution) {
    return { ok: false, reason: 'not_found' }
  }

  if (state.centerCapacity !== null && state.centerTaken >= state.centerCapacity) {
    return { ok: false, reason: 'full' }
  }

  return { ok: true }
}

/** הודעה למשתמש לכל סיבת דחייה — משותפת לשני הערוצים. */
export const PICK_MESSAGES: Record<Exclude<PickResult, { ok: true }>['reason'], string> = {
  closed: 'בחירת מוקד החלוקה אינה פתוחה כעת',
  locked: 'כבר נבחר מוקד ולא ניתן לשנותו. לבירורים יש לפנות למשרד',
  full: 'המוקד שנבחר מלא. יש לבחור מוקד אחר',
  not_found: 'המוקד המבוקש אינו זמין בחלוקה זו',
}

export interface CityGroup {
  city: string
  centers: CenterRow[]
}

/**
 * מקבץ מוקדים לאזור → עיר → מוקדים.
 *
 * 🔴 עיר מופיעה **פעם אחת** ברשימת הערים, גם כשיש בה חמישה מוקדים:
 * תפריט שמקריא "ירושלים" חמש פעמים חסר משמעות. הבחירה בין המוקדים היא
 * שלב נפרד שמגיע רק אחרי בחירת העיר, וכך מדבר גם נוסח ההודעה למשפחות.
 */
export function groupByRegion(rows: CenterRow[]): Record<RegionKey, CityGroup[]> {
  const out = { jerusalem: [], center: [], north: [], south: [] } as Record<RegionKey, CityGroup[]>

  const sorted = [...rows].sort((a, b) =>
    a.sort_order - b.sort_order || a.city.localeCompare(b.city, 'he'))

  for (const row of sorted) {
    const region = (row.region in out ? row.region : 'center') as RegionKey
    const group = out[region].find(g => g.city === row.city)
    if (group) group.centers.push(row)
    else out[region].push({ city: row.city, centers: [row] })
  }

  return out
}
