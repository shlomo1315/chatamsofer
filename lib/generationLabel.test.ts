import { describe, it, expect } from 'vitest'
import { generationLabel, LRM } from './generationLabel'

// ─────────────────────────────────────────────────────────────────────────────
// בטופס אישור רב, שורת "דור 10:" הופיעה על הדף כ-"דור 01:".
//
// השורש: pdf-lib מצייר תווים לפי סדרם במחרוזת ואינו מיישם bidi. במחרוזת
// עברית (RTL) רצף ספרות הוא מקטע LTR מוטבע, ובלי סימון כיווניות מפורש
// הוא נצבע בכיוון של הסביבה — כלומר מצויר הפוך.
//
// דורות 1-9 הסתירו את הבאג: ספרה בודדת נראית זהה בשני הכיוונים. הוא
// נחשף רק במשפחה עם עשרה דורות ומעלה — כלומר דווקא בייחוס הארוך, שהוא
// המקרה החשוב ביותר בטופס הזה.
//
// ⚠️ אימות חזותי חובה: הפקת טקסט מ-PDF מציגה סדר *לוגי* ולכן עברית
// נראית שבורה גם כשהיא תקינה. הטסט הזה בודק את המחרוזת שנשלחת לציור,
// לא את הפלט — הפלט נבדק בעין.
// ─────────────────────────────────────────────────────────────────────────────

describe('generationLabel', () => {
  it('🔴 הרגרסיה: דור 10 אינו מתהפך ל-01', () => {
    const label = generationLabel(10)
    // הספרות חייבות להישאר בסדרן, ועטופות בסימון כיווניות
    expect(label).toContain(`${LRM}10${LRM}`)
    expect(label).not.toContain('01')
  })

  it('ספרה בודדת — נשארת תקינה כמו קודם', () => {
    expect(generationLabel(1)).toContain(`${LRM}1${LRM}`)
    expect(generationLabel(9)).toContain(`${LRM}9${LRM}`)
  })

  it('גם דורות דו-ספרתיים גבוהים', () => {
    for (const n of [11, 12, 19, 20, 23]) {
      expect(generationLabel(n)).toContain(`${LRM}${n}${LRM}`)
      // הצורה ההפוכה לא מופיעה
      const reversed = String(n).split('').reverse().join('')
      if (reversed !== String(n)) {
        expect(generationLabel(n)).not.toContain(`${LRM}${reversed}${LRM}`)
      }
    }
  })

  it('שומר על המילה "דור" ועל הנקודתיים', () => {
    // ⚠️ הנקודתיים אינן מתהפכות כאן — ראה ההערה ב-rabbiFormPdf. הפקת
    // הטקסט מציגה אותן בסדר הלוגי וזה *נראה* כבאג, אך הרינדור תקין.
    const label = generationLabel(3)
    expect(label.startsWith('דור ')).toBe(true)
    expect(label.endsWith(':')).toBe(true)
  })
})
