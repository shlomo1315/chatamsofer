// ─────────────────────────────────────────────────────────────────────────────
// סינון שורות הדוח.
//
// ⚠️ הלוגיקה כאן ולא ברכיב — כך היא נבדקת על מקרי הקצה האמיתיים של
// המאגר ולא רק על המסך: 263 משפחות בלי שיוך לדור, 62 בלי תאריך לידה,
// 51 בלי מצב משפחתי, 62 בלי קהילה.
//
// 🔴 ההבחנה המרכזית: שורה שנפלה כי הערך *לא תואם* היא תשובה של הדוח;
// שורה שנפלה כי *חסר לה נתון* היא ליקוי שהמשתמש חייב לראות. ערבוב
// ביניהם היה מציג אזהרה על כל דוח מסונן, או — גרוע יותר — מסתיר 263
// משפחות בשקט ומציג את התוצאה כמלאה.
// ─────────────────────────────────────────────────────────────────────────────

export type ReportRow = {
  id: string
  familyName: string
  fullName: string
  idNumber: string | null
  city: string | null
  address: string | null
  phone: string | null
  email: string | null
  community: string | null
  generation: number | null
  birthDate: string | null
  childrenCount: number
  maritalStatus: string | null
  status: string | null
}

export type ReportFilters = {
  communities?: string[]
  generations?: number[]
  cities?: string[]
  ageMin?: number | null
  ageMax?: number | null
  childrenMin?: number | null
  childrenMax?: number | null
  maritalStatuses?: string[]
  statuses?: string[]
}

export type ExcludedReason = { reason: string; count: number }
export type FilterResult = { rows: ReportRow[]; excluded: ExcludedReason[] }

/**
 * גיל בשנים מלאות.
 *
 * 🔴 מחזיר null על תאריך חסר או פגום — לעולם לא 0. גיל 0 היה נכלל
 * בסינון "עד גיל 30" ומזייף את הדוח.
 * ⚠️ new Date('לא-תאריך') הוא Invalid Date, וכל חישוב עליו מחזיר NaN
 * בלי לזרוק — ולכן נדרשת בדיקת isNaN מפורשת.
 */
export function ageFrom(birthDate: string | null | undefined, today = new Date()): number | null {
  const raw = (birthDate ?? '').trim()
  if (!raw) return null
  const dt = new Date(raw)
  if (isNaN(dt.getTime())) return null

  let age = today.getFullYear() - dt.getFullYear()
  const monthDiff = today.getMonth() - dt.getMonth()
  // יום ההולדת טרם הגיע השנה — שנה פחות
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dt.getDate())) age--
  return age
}

/** מערך סינון פעיל? ⚠️ [] פירושו "לא נבחר", לא "אף אחד". */
const active = <T>(list: T[] | undefined): list is T[] => Array.isArray(list) && list.length > 0

export function applyFilters(
  rows: ReportRow[],
  f: ReportFilters,
  today = new Date(),
): FilterResult {
  // סופר חוסרים לפי סיבה. נספר רק כשהסינון על אותו שדה *פעיל* —
  // אחרת כל דוח היה מציג אזהרה על שדות שאיש לא סינן לפיהם.
  const missing = new Map<string, number>()
  const bump = (reason: string) => missing.set(reason, (missing.get(reason) ?? 0) + 1)

  const filterCommunity = active(f.communities)
  const filterGeneration = active(f.generations)
  const filterCity = active(f.cities)
  const filterMarital = active(f.maritalStatuses)
  const filterStatus = active(f.statuses)
  const filterAge = f.ageMin != null || f.ageMax != null
  const filterChildren = f.childrenMin != null || f.childrenMax != null

  const out = rows.filter(r => {
    if (filterCommunity) {
      const v = (r.community ?? '').trim()
      if (!v) { bump('חסר שיוך לקהילה'); return false }
      if (!f.communities!.includes(v)) return false
    }

    if (filterGeneration) {
      if (r.generation == null) { bump('חסר שיוך לדור'); return false }
      if (!f.generations!.includes(r.generation)) return false
    }

    if (filterCity) {
      const v = (r.city ?? '').trim()
      if (!v) { bump('חסרה עיר'); return false }
      if (!f.cities!.includes(v)) return false
    }

    if (filterMarital) {
      const v = (r.maritalStatus ?? '').trim()
      if (!v) { bump('חסר מצב משפחתי'); return false }
      if (!f.maritalStatuses!.includes(v)) return false
    }

    if (filterStatus) {
      const v = (r.status ?? '').trim()
      if (!v) { bump('חסר סטטוס רישום'); return false }
      if (!f.statuses!.includes(v)) return false
    }

    if (filterAge) {
      const age = ageFrom(r.birthDate, today)
      if (age == null) { bump('חסר תאריך לידה'); return false }
      if (f.ageMin != null && age < f.ageMin) return false
      if (f.ageMax != null && age > f.ageMax) return false
    }

    if (filterChildren) {
      // ⚠️ הטווח כולל את הקצוות — "בין 2 ל-4" כולל 2 ו-4.
      if (f.childrenMin != null && r.childrenCount < f.childrenMin) return false
      if (f.childrenMax != null && r.childrenCount > f.childrenMax) return false
    }

    return true
  })

  const excluded: ExcludedReason[] = [...missing.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  return { rows: out, excluded }
}

/** ערכי הקיבוץ הנתמכים בגיליון הסיכום. */
export type GroupBy = 'community' | 'generation' | 'city'

/**
 * ספירה מקובצת לגיליון הסיכום.
 * ⚠️ שורה בלי ערך נספרת תחת "ללא שיוך" ואינה נעלמת — אחרת סכום
 * הקבוצות אינו מסתדר עם סך השורות, וזה נראה כמו באג.
 */
export function groupCounts(rows: ReportRow[], by: GroupBy): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const raw = by === 'community' ? r.community
      : by === 'city' ? r.city
      : r.generation == null ? null : `דור ${r.generation}`
    const label = (raw ?? '').toString().trim() || 'ללא שיוך'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}
