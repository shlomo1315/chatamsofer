import { describe, it, expect } from 'vitest'
import { wrapText } from './rtlText'
import { VOUCHER_TEXT_GROUPS } from './voucherTextsCatalog'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 אזהרת "ודאו שהחנות מקבלת את הכרטיס" — בשובר היולדות בלבד.
//
// ⚠️ רשימת החנויות המכבדות את הכרטיס משתנה מפעם לפעם. יולדת שקנתה בחנות
// שכבר אינה ברשימה נתקעת בקופה עם עגלה מלאה — ולכן האזהרה מודגשת.
//
// 🔴 הבדיקה כאן היא בדיקת *מקום*: השובר צפוף, והתחתית שלו כבר נחתכה בעבר
// (ראו ההערות ב-maternityVoucher: החתימה יצאה ל-y שלילי ונחתכה). הבלוק
// התחתון מעוגן ל-NOTES_TOP=62 והחתימה ל-blessY=46, ולכן טקסט שגדל מעבר
// לגובה הפנוי דורך על הברכה. הטסט נועל את הגבול הזה.
// ─────────────────────────────────────────────────────────────────────────────

const W = 595.28
const MX = 42
/** רוחב הפסקה בבלוק ההערות התחתון, כפי שהוא בקוד. */
const NOTES_W = W - MX * 2

/** קירוב רוחב תו ב-Heebo. שמרני בכוונה — עדיף להעריך רחב מדי מצר מדי. */
const measureAt = (fs: number) => (s: string) => s.length * fs * 0.47

const catalogText = (key: string): string => {
  for (const g of VOUCHER_TEXT_GROUPS) {
    const hit = g.fields.find(i => i.key === key)
    if (hit) return hit.default
  }
  throw new Error(`מפתח ${key} אינו בקטלוג`)
}

describe('🔴 אזהרת החנויות בשובר היולדות', () => {
  it('קיימת בקטלוג הנוסחים — כלומר ניתנת לעריכה בלי קוד', () => {
    expect(() => catalogText('card.stores')).not.toThrow()
  })

  it('כוללת את ההנחיה המעשית ולא רק אזהרה כללית', () => {
    const t = catalogText('card.stores')
    expect(t).toContain('לפני הרכישה')
    expect(t).toContain('מקבלת את הכרטיס')
  })

  // 🔴 הגבול האמיתי: NOTES_TOP=62 מול blessY=46 → 16 נקודות עד הברכה.
  // הערת התוקף לבדה תופסת שורה אחת (9.5+2 ≈ 11.5), ולכן האזהרה חייבת
  // לשבת *מעל* בלוק ההערות ולא בתוכו — והטסט מוודא שהיא אכן קצרה מספיק
  // כדי להיכנס בשתי שורות בפונט 9.
  it('🔴 נכנסת בשתי שורות לכל היותר — אחרת התחתית נדרסת', () => {
    const lines = wrapText(catalogText('card.stores'), NOTES_W, measureAt(9))
    expect(lines.length).toBeLessThanOrEqual(2)
  })

  it('אינה ריקה ואינה חורגת לאורך בלתי סביר', () => {
    const t = catalogText('card.stores')
    expect(t.trim().length).toBeGreaterThan(40)
    expect(t.length).toBeLessThan(400)
  })
})
