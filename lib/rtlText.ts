// טקסט עברי ב-pdf-lib: מנוע ההצגה של PDF מיישם bidi בעצמו על טקסט לוגי,
// ולכן יש להעביר את הטקסט בסדר הלוגי (כפי שנכתב) — בלי היפוך ידני.
// (היפוך ידני דווקא שובר את התצוגה.)

// פיצול פסקה לוגית לשורות לפי רוחב מרבי — מחזיר שורות בסדר לוגי (ללא היפוך).
export function wrapText(text: string, maxWidth: number, measure: (line: string) => number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const out: string[] = []
  let line = ''
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w
    if (line && measure(cand) > maxWidth) {
      out.push(line)
      line = w
    } else {
      line = cand
    }
  }
  if (line) out.push(line)
  return out
}
