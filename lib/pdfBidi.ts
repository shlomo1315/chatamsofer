// עיבוד bidi אמיתי לטקסט עברי ב-PDF (pdf-lib אינו מיישם אלגוריתם bidi בעצמו).
// getReorderedString ממיר טקסט בסדר לוגי → סדר visual (כולל היפוך סוגריים, בידוד
// מספרים/מייל/שעות), וזה מה ש-pdf-lib מצייר כפי שהוא. מחליף את הפתרון הידני הישן (isoNum).
import bidiFactory from 'bidi-js'

const bidi = bidiFactory()

// ממיר שורת טקסט אחת (בלי newlines) מסדר לוגי לסדר visual לציור ב-PDF.
export function toVisual(text: string): string {
  const s = String(text ?? '')
  if (!s) return s
  try {
    const levels = bidi.getEmbeddingLevels(s, 'rtl') // בסיס RTL — טקסט עברי
    return bidi.getReorderedString(s, levels)
  } catch {
    return s // כשל → הטקסט המקורי (עדיף מקריסה)
  }
}
