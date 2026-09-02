import { normalizeCityName } from '@/lib/govData'

// ─────────────────────────────────────────────────────────────────────────────
// שיבוץ אוטומטי למוקד לפי עיר המגורים.
//
// 🔴 למה זה קיים: אחרי שהמועד חולף נשארות מאות משפחות בלי מוקד. אי אפשר
// להשאיר אותן בלי כרטיס בגלל שלא בחרו, ואי אפשר גם לשבץ אותן בשקט —
// לחלוקה הבאה צריך לדעת מי בחר בעצמו ומי שובץ על ידינו.
//
// לכן כל שיבוץ כאן נושא center_source='auto', שנשאר על השורה לתמיד ומבדיל
// אותה מ-'portal' / 'phone' (המשפחה בחרה) ומ-'office' (שיוך ידני נקודתי).
//
// ⚠️ פונקציה טהורה — אין כאן גישה למסד. הקורא שולף ומעביר, וכך אפשר לבדוק
// את כללי ההתאמה בלי מסד ובלי חלוקה חיה.
// ─────────────────────────────────────────────────────────────────────────────

export interface AssignCenter {
  id: string
  name: string | null
  city: string | null
  /** כמה כבר משובצים בו — קובע מיהו "המוקד הגדול" בעיר. */
  taken: number
}

export interface AssignRecipient {
  id: string
  /** עיר המגורים של המשפחה. */
  city: string | null
  source?: string | null
  deadline_extended?: boolean | null
}

export interface AssignPlanRow {
  recipientId: string
  centerId: string
  centerName: string
  city: string
}

export interface AssignPlan {
  /** מה ישובץ בפועל. */
  rows: AssignPlanRow[]
  /** לפי מוקד — לתצוגה מקדימה. */
  byCenter: { centerId: string; centerName: string; count: number; taken: number }[]
  /** אין מוקד פתוח בעיר שלהם. */
  noCenterInCity: { city: string; count: number }[]
  /** אין עיר רשומה בכרטסת — אי אפשר לשבץ, וזו תקלת נתונים ולא מקרה קצה. */
  noCity: number
  /** דולגו כי המועד שלהם עדיין פתוח. */
  skippedStillOpen: number
}

/**
 * בונה את תוכנית השיבוץ.
 *
 * @param skipExtended כשדולקת — מדלגים על מי שהמועד המוארך שלו עדיין פתוח.
 *   ⚠️ ברירת המחדל: שיבוץ נועל את הבחירה, ולכן אין לשבץ משפחה שעוד רשאית
 *   לבחור בעצמה. ראו lib/centerDeadline.
 */
export function buildAssignPlan(
  recipients: AssignRecipient[],
  centers: AssignCenter[],
  opts: { skipExtended?: boolean } = {},
): AssignPlan {
  const skipExtended = opts.skipExtended !== false

  // ── המוקד הנבחר לכל עיר ──
  //
  // 🔴 המוקד עם הכי הרבה משובצים, ולא הריק ביותר.
  //
  // ⚠️ בערים הגדולות המוקדים הם שכונות (ירושלים: מאה שערים מול רמות פולין).
  // איזון עומסים היה שולח משפחה לקצה השני של העיר. המוקד שהכי הרבה בחרו בו
  // הוא המרכזי בפועל, והוא ההימור הבטוח כשאיננו יודעים מה המשפחה מעדיפה.
  const byCity = new Map<string, AssignCenter>()
  for (const c of centers) {
    const key = normalizeCityName(c.city ?? '')
    if (!key) continue
    const cur = byCity.get(key)
    // ⚠️ שובר-שוויון לפי שם: בלעדיו הבחירה תלויה בסדר השורות מהמסד,
    // ואותה הרצה הייתה נותנת תוצאה אחרת בכל פעם.
    if (!cur || c.taken > cur.taken
      || (c.taken === cur.taken && (c.name ?? '') < (cur.name ?? ''))) {
      byCity.set(key, c)
    }
  }

  const rows: AssignPlanRow[] = []
  const perCenter = new Map<string, { name: string; count: number; taken: number }>()
  const missing = new Map<string, number>()
  let noCity = 0
  let skippedStillOpen = 0

  for (const r of recipients) {
    if (skipExtended && (r.source === 'admin' || r.deadline_extended === true)) {
      skippedStillOpen++
      continue
    }
    const key = normalizeCityName(r.city ?? '')
    if (!key) { noCity++; continue }

    const center = byCity.get(key)
    if (!center) {
      missing.set(r.city ?? '', (missing.get(r.city ?? '') ?? 0) + 1)
      continue
    }

    const name = center.name ?? ''
    rows.push({ recipientId: r.id, centerId: center.id, centerName: name, city: r.city ?? '' })
    const e = perCenter.get(center.id)
    if (e) e.count++
    else perCenter.set(center.id, { name, count: 1, taken: center.taken })
  }

  return {
    rows,
    byCenter: [...perCenter.entries()]
      .map(([centerId, v]) => ({ centerId, centerName: v.name, count: v.count, taken: v.taken }))
      .sort((a, b) => b.count - a.count),
    noCenterInCity: [...missing.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, 'he')),
    noCity,
    skippedStillOpen,
  }
}
