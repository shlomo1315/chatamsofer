// ─────────────────────────────────────────────────────────────────────────────
// שם הספר לאורך הצד של תווית ברקוד — חישוב פריסה טהור (נבדק בטסטים).
//
// 🔴 דרישת המשתמש (05.10): כל הטקסט חייב להיכנס בצד, ואם צריך — בשתי
// שורות. אין חיתוך ואין "...". סדר העדיפויות:
//   1. שורה אחת בגודל הרגיל
//   2. שורה אחת מוקטנת — עד גודל שעדיין קריא
//   3. שתי שורות, בגודל הגדול ביותר שנכנס
//   4. שם חריג במיוחד — שתי שורות מוקטנות עוד, כך שתמיד נכנס במלואו
//
// ⚠️ "אורך" כאן = גובה התווית (הטקסט מסובב 90°), ו"רוחב" הפס = מספר
// השורות × גובה שורה.
// ─────────────────────────────────────────────────────────────────────────────

export type Measure = (text: string, size: number) => number

export const SIDE_TITLE = {
  /** גודל מועדף. */
  max: 8,
  /** הקטן ביותר שעדיין קריא בשורה אחת — מתחתיו עדיף לשבור לשתיים. */
  minOneLine: 6.5,
  /** רצפת ביטחון: שם ארוך במיוחד מוקטן עד כאן כדי שייכנס במלואו. */
  floor: 4,
  step: 0.25,
  /** גובה שורה ביחס לגודל הגופן. */
  lineHeight: 1.15,
} as const

export interface SideTitleLayout {
  lines: string[]
  size: number
  /** רוחב הפס שהטקסט תופס (לפני ריווח). */
  thickness: number
}

/** פיצול מאוזן לשתי שורות — נקודת השבירה שממזערת את השורה הארוכה. */
export function splitBalanced(title: string, measure: Measure, size: number): [string, string] | null {
  const words = title.trim().split(/\s+/)
  if (words.length < 2) return null
  let best: [string, string] | null = null
  let bestLen = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const len = Math.max(measure(a, size), measure(b, size))
    if (len < bestLen) { bestLen = len; best = [a, b] }
  }
  return best
}

export function layoutSideTitle(title: string, measure: Measure, available: number): SideTitleLayout {
  const t = title.trim()
  const { max, minOneLine, floor, step, lineHeight } = SIDE_TITLE
  const fits = (lines: string[], size: number) => lines.every(l => measure(l, size) <= available)
  const make = (lines: string[], size: number): SideTitleLayout =>
    ({ lines, size, thickness: lines.length * size * lineHeight })

  // 1–2: שורה אחת, מהגדול לקטן עד הסף הקריא
  for (let s = max; s >= minOneLine; s -= step) {
    if (fits([t], s)) return make([t], s)
  }
  // 3–4: שתי שורות, מהגדול עד רצפת הביטחון
  for (let s = max; s >= floor; s -= step) {
    const two = splitBalanced(t, measure, s)
    if (two && fits(two, s)) return make(two, s)
  }
  // מילה אחת ארוכה מאוד (אין איפה לשבור) — שורה אחת בגודל שבדיוק נכנס.
  const one = measure(t, 1)
  const exact = one > 0 ? Math.min(max, available / one) : max
  const two = splitBalanced(t, measure, floor)
  if (two && fits(two, floor)) return make(two, floor)
  return make([t], Math.max(0.5, exact))
}
