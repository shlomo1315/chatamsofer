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

/**
 * הודעה למשתמש לכל סיבה — משותפת לשני הערוצים.
 *
 * 🔴 `locked` אינה הודעת שגיאה אלא **אישור**: מי שמתקשר שוב רוצה לדעת
 * איזה מוקד בחר, לא לשמוע שנכשל. הנוסח מוסר את המידע ורק אז מבהיר
 * שאי אפשר לשנות.
 *
 * ⚠️ `{center}` מוחלף בשם המוקד — ראו pickMessage(). בלי השם ההודעה
 * חסרת ערך בדיוק ברגע שבו המשפחה זקוקה לו.
 */
export const PICK_MESSAGES: Record<Exclude<PickResult, { ok: true }>['reason'], string> = {
  closed: 'בחירת מוקד החלוקה אינה פתוחה כעת',
  locked: 'כבר נרשמתם למוקד החלוקה ב{center}. לא ניתן לשנות את הבחירה',
  full: 'המוקד שנבחר מלא. יש לבחור מוקד אחר',
  not_found: 'המוקד המבוקש אינו זמין בחלוקה זו',
}

/**
 * ההודעה המוצגת בפועל, עם שם המוקד משובץ.
 *
 * ⚠️ נפילה-לאחור כשאין שם: "נרשמתם למוקד החלוקה" בלי שם עדיף על
 * המחרוזת "{center}" שמושמעת למתקשר כפי שהיא.
 */
export function pickMessage(
  reason: Exclude<PickResult, { ok: true }>['reason'],
  centerLabel?: string | null,
): string {
  const raw = PICK_MESSAGES[reason]
  if (!raw.includes('{center}')) return raw
  return centerLabel
    ? raw.replace('{center}', centerLabel)
    : raw.replace(' ב{center}', '')
}

/**
 * אזהרת הסופיות — מוצגת **לפני** האישור, בשני הערוצים.
 *
 * 🔴 חובה לפני האישור ולא אחריו: אחרי הלחיצה כבר אין מה לעשות עם
 * המידע. משפחה שתגלה רק בדיעבד שהבחירה נעולה תתקשר למשרד.
 *
 * ⚠️ שני נוסחים ולא אחד — הטלפון נשמע והאתר נקרא. נוסח ארוך בשלוחה
 * מאבד את המאזין לפני ההוראה עצמה; נוסח טלגרפי במסך נראה מרושל.
 * שניהם ניתנים לעריכה בהגדרות (yemotHolidayMessages / הפורטל).
 */
export const FINAL_WARNING = {
  /** שלוחה — קצר, וההוראה מיד אחריו. */
  phone: 'שימו לב, בחירת המוקד היא סופית ואינה ניתנת לשינוי. ' +
         'לאישור הרישום למוקד זה הקישו 1, לחזרה לרשימה הקישו 2',
  /** אתר — אפשר לפרט את ההשלכה. */
  portal: 'הבחירה סופית. לאחר האישור לא ניתן לשנות את המוקד, ' +
          'והשובר יישלח למוקד שנבחר בלבד.',
} as const

/** תווית מוקד לתצוגה: "ירושלים · אזור נווה צבי". */
export function centerLabel(c: Pick<CenterRow, 'city' | 'name'> | null | undefined): string | null {
  if (!c) return null
  // ⚠️ עיר ששמה זהה לשם המוקד (רוב הערים) לא תוצג פעמיים.
  return c.city === c.name ? c.city : `${c.city} · ${c.name}`
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
