// ─────────────────────────────────────────────────────────────────────────────
// התאמת שם הספר לראש מדבקה קטנה (7×3.5 ס"מ).
//
// 🔴 כל השם נכנס תמיד — בלי חיתוך ובלי "...". קודם מנסים גודל גדול
// בשורה אחת או שתיים, ורק אם לא נכנס — מקטינים, ובגדלים הקטנים מותרות
// גם שלוש שורות.
//
// פונקציה טהורה: המדידה מוזרקת (font.widthOfTextAtSize), כך שהיא נבדקת
// בלי pdf-lib.
// ─────────────────────────────────────────────────────────────────────────────

export interface StickerTitleLayout {
  size: number
  lines: string[]
  /** גובה הבלוק בפועל (שורות × מרווח). */
  height: number
}

export const STICKER_LINE_GAP = 1.15

/** עטיפה חמדנית לפי מילים. מילה בודדת ארוכה מהרוחב נשארת בשורה משלה. */
function wrap(words: string[], measure: (t: string, s: number) => number, size: number, maxW: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w
    if (!cur || measure(cand, size) <= maxW) cur = cand
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines
}

export function layoutStickerTitle(
  title: string,
  measure: (text: string, size: number) => number,
  maxW: number,
  maxH: number,
  opts: { max?: number; min?: number } = {},
): StickerTitleLayout {
  const words = String(title ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return { size: opts.max ?? 11, lines: [], height: 0 }
  const max = opts.max ?? 11
  const min = opts.min ?? 4

  for (let size = max; size >= min; size -= 0.25) {
    const maxLines = size >= 7 ? 2 : 3
    const lines = wrap(words, measure, size, maxW)
    const height = lines.length * size * STICKER_LINE_GAP
    const fitsW = lines.every(l => measure(l, size) <= maxW)
    if (lines.length <= maxLines && fitsW && height <= maxH) return { size, lines, height }
  }

  // ⚠️ רשת ביטחון: גם בגודל המינימלי לא נכנס (שם ארוך מאוד) — מקטינים
  // עוד, יחסית לשורה הרחבה ביותר, ולא חותכים.
  const lines = wrap(words, measure, min, maxW)
  const widest = Math.max(...lines.map(l => measure(l, min)))
  const byW = widest > maxW ? min * (maxW / widest) : min
  const byH = (maxH / (lines.length * STICKER_LINE_GAP))
  const size = Math.min(byW, byH, min)
  return { size, lines, height: lines.length * size * STICKER_LINE_GAP }
}
