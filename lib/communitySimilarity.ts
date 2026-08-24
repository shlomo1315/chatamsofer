// ─────────────────────────────────────────────────────────────────────────────
// זיהוי שמות קהילה שהם ככל הנראה אותה קהילה.
//
// 🔴 במאגר 1,928 ערכי `community_affiliation` ל-7,108 משפחות, כי השדה
// הוא טקסט חופשי. "ליטאי"(495) · "ליטאים"(311) · "ליטאית"(67) ·
// "לטאי"(45) הם קהילה אחת של 918 משפחות המפוצלת לארבע רשומות — ודוח
// לפי קהילה על הנתונים כמות שהם מחזיר תשובה שגויה.
//
// ⚠️ המודול *מציע* בלבד ואינו כותב דבר. מיזוג אוטומטי היה מאחד בטעות
// קהילות שנכתבות דומה, והמשתמש לא היה יודע שזה קרה.
// ─────────────────────────────────────────────────────────────────────────────

export type CommunityCount = { name: string; count: number }

export type SuggestedGroup = {
  /** הגרסה הנפוצה ביותר — מוצעת כשם המאוחד */
  suggestedName: string
  members: CommunityCount[]
  totalFamilies: number
}

/**
 * נרמול להשוואה בלבד.
 *
 * ⚠️ הערך המנורמל לעולם אינו נשמר למסד — הוא משמש רק כדי להחליט מה
 * דומה למה. שמירתו הייתה מוחקת את הכתיב שהמשפחה עצמה בחרה.
 */
export function normalizeForCompare(name: string): string {
  return (name ?? '')
    .replace(/["'׳״]/g, '')      // גרש/גרשיים: ויז'ניץ ↔ ויזניץ
    .replace(/\s+/g, ' ')
    .trim()
    // סיומות ייחוס/ריבוי/נקבה → אותו בסיס.
    // ⚠️ שני שלבים ולא ביטוי אחד: "ליטאים" מאבד את "ים" ונשאר "ליטא",
    // בעוד "ליטאי" מאבד רק את ה-"י". בלי הסרת ה-"י" הבודד אחריה,
    // שתי הצורות נותרות שונות — וארבע גרסאות ליטאי לא היו מתקבצות.
    .replace(/(ים|ית|ות)$/u, '')
    .replace(/י$/u, '')
}

/** מרחק עריכה (Levenshtein) — כמה תווים צריך לשנות כדי לעבור בין השניים. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * ציון דמיון 0..1 על המחרוזות המנורמלות.
 *
 * ⚠️ יחסי לאורך ולא מרחק מוחלט: מרחק 1 בין "גור" ל"גז" הוא שליש
 * מהמילה ומשמעותי, בעוד מרחק 1 בשם ארוך כמו "ראחמיסטריווקא" זניח.
 */
export function similarity(a: string, b: string): number {
  const x = normalizeForCompare(a)
  const y = normalizeForCompare(b)
  if (!x && !y) return 1
  if (!x || !y) return 0
  if (x === y) return 1
  const longest = Math.max(x.length, y.length)
  return 1 - editDistance(x, y) / longest
}

/**
 * מקבץ ערכים דומים.
 *
 * הקבוצות ממוינות לפי מספר המשפחות — הגדולות קודם, כי שם התיקון משפיע
 * על הכי הרבה נתונים.
 *
 * ⚠️ קבוצה של איבר בודד אינה מוחזרת: 134 שורות "קבוצה של אחד" היו
 * מסתירות את הקבוצות האמיתיות שדורשות הכרעה.
 */
export function suggestGroups(items: CommunityCount[], minScore = 0.72): SuggestedGroup[] {
  const pool = items.filter(i => (i.name ?? '').trim())
  const used = new Set<string>()
  const groups: SuggestedGroup[] = []

  // מהגדול לקטן: הגרסה הנפוצה מובילה את הקבוצה ונעשית השם המוצע.
  const sorted = [...pool].sort((a, b) => b.count - a.count)

  for (const seed of sorted) {
    if (used.has(seed.name)) continue
    const members = [seed]
    used.add(seed.name)

    for (const other of sorted) {
      if (used.has(other.name)) continue
      if (similarity(seed.name, other.name) >= minScore) {
        members.push(other)
        used.add(other.name)
      }
    }

    if (members.length >= 2) {
      groups.push({
        suggestedName: seed.name,
        members,
        totalFamilies: members.reduce((s, m) => s + m.count, 0),
      })
    }
  }

  return groups.sort((a, b) => b.totalFamilies - a.totalFamilies)
}
