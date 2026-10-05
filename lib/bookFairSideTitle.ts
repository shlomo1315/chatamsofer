// ─────────────────────────────────────────────────────────────────────────────
// שם הספר לאורך הצד של תווית ברקוד — חישוב פריסה טהור (נבדק בטסטים).
//
// 🔴 דרישת המשתמש (05.10): כל הטקסט חייב להיכנס בצד — אין חיתוך ואין
// "...". אם צריך — כמה שורות. סדר העדיפויות:
//   1. שורה אחת בגודל הרגיל
//   2. שורה אחת מוקטנת — עד גודל שעדיין קריא
//   3. 2, 3 ואז 4 שורות — בכל אחת הגודל הגדול ביותר שנכנס
//   4. שם חריג במיוחד — רצפת ביטחון, כך שתמיד נכנס במלואו
//
// ⚠️ "אורך" כאן = גובה התווית (הטקסט מסובב 90°), ו"עובי" הפס = מספר
// השורות × גובה שורה. תוויות לגב ספר צר נמוכות (~17 מ"מ), ולכן שם
// ארוך זקוק ליותר משתי שורות.
// ─────────────────────────────────────────────────────────────────────────────

export type Measure = (text: string, size: number) => number

export const SIDE_TITLE = {
  /** גודל מועדף. */
  max: 8,
  /** הקטן ביותר שעדיין קריא בשורה אחת — מתחתיו עדיף לשבור. */
  minOneLine: 6,
  /** הקטן ביותר בכמה שורות לפני שמוסיפים שורה נוספת. */
  minMulti: 4.5,
  /** רצפת ביטחון אחרונה. */
  floor: 3.5,
  maxLines: 4,
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

/**
 * פיצול ל-k שורות שממזער את השורה הארוכה (חיפוש מלא על נקודות השבירה —
 * שם ספר הוא עד ~12 מילים, כך שזה זול).
 */
export function splitInto(title: string, k: number, measure: Measure, size: number): string[] | null {
  const words = title.trim().split(/\s+/)
  if (k <= 1) return [words.join(' ')]
  if (words.length < k) return null
  let best: string[] | null = null
  let bestLen = Infinity
  const rec = (start: number, left: number, acc: string[]) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start).join(' ')]
      const len = Math.max(...lines.map(l => measure(l, size)))
      if (len < bestLen) { bestLen = len; best = lines }
      return
    }
    for (let end = start + 1; end <= words.length - (left - 1); end++) {
      rec(end, left - 1, [...acc, words.slice(start, end).join(' ')])
    }
  }
  rec(0, k, [])
  return best
}

/** תאימות לאחור — פיצול לשתיים. */
export function splitBalanced(title: string, measure: Measure, size: number): [string, string] | null {
  const r = splitInto(title, 2, measure, size)
  return r ? [r[0], r[1]] : null
}

export function layoutSideTitle(title: string, measure: Measure, available: number): SideTitleLayout {
  const t = title.trim()
  const { max, minOneLine, minMulti, floor, maxLines, step, lineHeight } = SIDE_TITLE
  const fits = (lines: string[], size: number) => lines.every(l => measure(l, size) <= available)
  const make = (lines: string[], size: number): SideTitleLayout =>
    ({ lines, size, thickness: lines.length * size * lineHeight })

  // 1–2: שורה אחת, מהגדול עד הסף הקריא
  for (let s = max; s >= minOneLine; s -= step) {
    if (fits([t], s)) return make([t], s)
  }
  // 3: 2..maxLines שורות, כל אחת מהגדול עד minMulti
  for (let k = 2; k <= maxLines; k++) {
    for (let s = max; s >= minMulti; s -= step) {
      const lines = splitInto(t, k, measure, s)
      if (lines && fits(lines, s)) return make(lines, s)
    }
  }
  // 4: רצפת ביטחון — הכי הרבה שורות שאפשר, מוקטן עד שנכנס
  const words = t.split(/\s+/).length
  const k = Math.max(1, Math.min(maxLines, words))
  for (let s = minMulti; s >= floor; s -= step) {
    const lines = splitInto(t, k, measure, s)
    if (lines && fits(lines, s)) return make(lines, s)
  }
  // מילה ארוכה מאוד בלי מקום לשבור — הגודל שבדיוק נכנס.
  const lines = splitInto(t, k, measure, 1) ?? [t]
  const longest = Math.max(...lines.map(l => measure(l, 1)))
  return make(lines, Math.max(0.5, Math.min(max, available / (longest || 1))))
}
