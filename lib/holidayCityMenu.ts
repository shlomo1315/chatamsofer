// ─────────────────────────────────────────────────────────────────────────────
// תפריט הערים בשלוחה — לפי מספרי עיר קבועים.
//
// 🔴 למה לא לפי מיקום ברשימה: המספר מתפרסם למשפחות מראש ("אלעד — 7").
// אילו היה נגזר מהמיקום, סגירת עיר אחת הייתה מזיזה את כל המספרים
// שאחריה, ומי שכבר יודע את המספר שלו היה מגיע למוקד של עיר אחרת.
//
// ⚠️ המספר יושב ב-sort_order של holiday_centers — אותו ערך לכל המוקדים
// שבאותה עיר, בדיוק כפי שהוא ברשימת המוקדים.
//
// ⚠️ שכבת ה"אזור" (REGIONS) נעקפת כאן במכוון: מתוך 18 הערים, 15 הן
// מוקד יחיד, ושכבת אזור הייתה מוסיפה להן הקשה בלי שום תועלת.
// ─────────────────────────────────────────────────────────────────────────────

import type { CenterRow } from './holidayCenterPick'

export interface CityEntry {
  /** מספר העיר כפי שהוא מוקרא ומתפרסם. */
  number: number
  city: string
  centers: CenterRow[]
}

/** מקבץ את המוקדים לערים, ממוין לפי מספר העיר. */
export function citiesByNumber(centers: CenterRow[]): CityEntry[] {
  const byCity = new Map<string, CityEntry>()
  for (const c of centers) {
    const existing = byCity.get(c.city)
    if (existing) { existing.centers.push(c); continue }
    byCity.set(c.city, { number: c.sort_order, city: c.city, centers: [c] })
  }
  // ⚠️ ממוין לפי המספר ולא לפי סדר ההגעה: ההקראה חייבת לעלות 1,2,3,
  // אחרת המתקשר שומע רשימה שנשמעת אקראית ומתקשה לעקוב.
  return [...byCity.values()].sort((a, b) => a.number - b.number)
}

/**
 * מאתר עיר לפי ההקשה.
 *
 * 🔴 מחפש לפי הערך ולא לפי אינדקס — זה כל ההבדל. הקשה 7 מגיעה לעיר
 * שמספרה 7, גם אם היא הרביעית ברשימה.
 */
export function findCityByNumber(centers: CenterRow[], tapped: string | undefined): CityEntry | null {
  const n = Number(String(tapped ?? '').trim())
  // ⚠️ אפס ולא-מספר נדחים במפורש: בלי זה Number('') = 0 היה מתפרש
  // כהקשה תקינה ומחזיר עיר שרירותית.
  if (!Number.isInteger(n) || n <= 0) return null
  return citiesByNumber(centers).find(c => c.number === n) ?? null
}

/** נוסח ההקראה — "לירושלים הקישו 1, לבני ברק הקישו 2…" */
export function cityMenuText(cities: CityEntry[]): string {
  return cities.map(c => `ל${c.city} הקישו ${c.number}`).join(' ')
}
