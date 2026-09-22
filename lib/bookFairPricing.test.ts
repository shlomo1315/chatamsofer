import { describe, it, expect } from 'vitest'
import {
  shekelsToAgorot, agorotToShekels, agorotToPaymentString,
  fmtAgorot, agorotToSpokenShekels,
  lineTotal, cartTotals, amountMatches,
} from './bookFairPricing'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 כסף באגורות כמספר שלם — ההכרעה שמונעת אי-התאמה מדומה מול הסליקה.
//
// הסיכון האמיתי: עגלה מחברת מחיר × כמות על כמה פריטים ועוד משלוח, ואז
// הסכום מושווה *לאגורה* מול מה שנגבה. בשברים עשרוניים הזמנה תקינה לגמרי
// הייתה נכשלת בהשוואה, נכנסת ל-payment_mismatch, ומחייבת בדיקת אנוש —
// על לא עוול בכפה.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 shekelsToAgorot — הגבול שבו שקלים הופכים לאגורות', () => {
  it('ממיר מחרוזת עשרונית', () => {
    expect(shekelsToAgorot('45.90')).toBe(4590)
    expect(shekelsToAgorot('120')).toBe(12000)
    expect(shekelsToAgorot('0.05')).toBe(5)
  })

  // 🔴 הבדיקה המרכזית של כל הקובץ.
  // parseFloat('45.90') * 100 === 4589.999999999999 — בלי Math.round,
  // המחיר שנשמר במסד קטן באגורה מהמחיר שהוזן, וההשוואה מול הסליקה תיכשל.
  it('🔴 45.90 הוא בדיוק 4590 ולא 4589', () => {
    expect(shekelsToAgorot('45.90')).toBe(4590)
    expect(shekelsToAgorot(45.90)).toBe(4590)
    // עוד ערכים שמתפרקים באריתמטיקת נקודה צפה
    expect(shekelsToAgorot('1.10')).toBe(110)
    expect(shekelsToAgorot('2.30')).toBe(230)
    expect(shekelsToAgorot('8.70')).toBe(870)
    expect(shekelsToAgorot('29.90')).toBe(2990)
  })

  // ⚠️ קובץ אקסל אמיתי אינו מכיל "1250" נקי אלא "₪1,250.00"
  it('מנקה פסיקים, סימני מטבע ורווחים', () => {
    expect(shekelsToAgorot('1,250')).toBe(125000)
    expect(shekelsToAgorot('₪45.90')).toBe(4590)
    expect(shekelsToAgorot('45.90 ₪')).toBe(4590)
    expect(shekelsToAgorot(' 120 ')).toBe(12000)
    expect(shekelsToAgorot('1,250.50')).toBe(125050)
  })

  // ⚠️ תווי כיווניות בלתי נראים מגיעים מהדבקה מ-Word ומאקסל בעברית.
  // המספר נראה תקין לחלוטין על המסך ונכשל בפענוח.
  it('⚠️ מנקה תווי כיווניות בלתי נראים', () => {
    expect(shekelsToAgorot('‏45.90')).toBe(4590)
    expect(shekelsToAgorot('‫120‬')).toBe(12000)
  })

  // 🔴 null ולא 0 — אחרת ספר בלי מחיר נשמר כחינמי, ונמכר בחינם.
  it('🔴 מחזיר null על קלט פסול — לא 0', () => {
    expect(shekelsToAgorot('')).toBeNull()
    expect(shekelsToAgorot('abc')).toBeNull()
    expect(shekelsToAgorot('שלוש עשרה')).toBeNull()
    expect(shekelsToAgorot(null)).toBeNull()
    expect(shekelsToAgorot(undefined)).toBeNull()
    expect(shekelsToAgorot('12.5.3')).toBeNull()
    expect(shekelsToAgorot(-5)).toBeNull()
    expect(shekelsToAgorot(NaN)).toBeNull()
  })

  it('0 הוא מחיר חוקי ואינו שגיאה', () => {
    expect(shekelsToAgorot('0')).toBe(0)
    expect(shekelsToAgorot(0)).toBe(0)
  })
})

describe('agorotToShekels / agorotToPaymentString', () => {
  it('ממיר חזרה', () => {
    expect(agorotToShekels(4590)).toBe(45.9)
    expect(agorotToShekels(12000)).toBe(120)
  })

  // ⚠️ הסליקה מקבלת מחרוזת עם שתי ספרות תמיד — "120" ייקרא אחרת מ-"120.00"
  it('🔴 מחרוזת סליקה — תמיד שתי ספרות', () => {
    expect(agorotToPaymentString(4590)).toBe('45.90')
    expect(agorotToPaymentString(12000)).toBe('120.00')
    expect(agorotToPaymentString(5)).toBe('0.05')
    expect(agorotToPaymentString(0)).toBe('0.00')
  })

  it('הלוך ושוב שומר על הערך', () => {
    for (const s of ['45.90', '120', '0.05', '1250.50', '99.99']) {
      const a = shekelsToAgorot(s)!
      expect(agorotToPaymentString(a)).toBe(parseFloat(s).toFixed(2))
    }
  })
})

describe('fmtAgorot — תצוגה', () => {
  it('שקלים עגולים בלי אפסים מיותרים', () => {
    expect(fmtAgorot(12000)).toBe('₪120')
    expect(fmtAgorot(0)).toBe('₪0')
  })

  it('אגורות שבורות עם שתי ספרות', () => {
    expect(fmtAgorot(4590)).toBe('₪45.90')
    expect(fmtAgorot(4505)).toBe('₪45.05')
  })

  it('מפריד אלפים', () => {
    expect(fmtAgorot(125000)).toBe('₪1,250')
    expect(fmtAgorot(125050)).toBe('₪1,250.50')
  })

  // ⚠️ he-IL מוסיף תווי כיווניות שנשברים במייל ובאקסל והמספר נראה הפוך.
  // אותו שיקול בדיוק כמו ב-lib/loanCurrency.
  it('⚠️ בלי תווי כיווניות', () => {
    for (const a of [12000, 4590, 125000]) {
      expect(fmtAgorot(a)).not.toMatch(/[‎‏‪-‮⁦-⁩]/)
    }
  })

  it('מחזיר מקף על ערך חסר', () => {
    expect(fmtAgorot(null)).toBe('—')
    expect(fmtAgorot(undefined)).toBe('—')
    expect(fmtAgorot(NaN)).toBe('—')
  })
})

describe('🔴 agorotToSpokenShekels — מה שהמתקשר שומע', () => {
  it('שקלים עגולים', () => {
    expect(agorotToSpokenShekels(12000)).toBe('120')
    expect(agorotToSpokenShekels(5000)).toBe('50')
  })

  // 🔴 עיגול *כלפי מעלה* בלבד. אם נקריא "ארבעים וחמישה" ונגבה 45.90,
  // הלקוח שמע סכום נמוך ממה שחויב — וזו הטעיה, לא אי-דיוק.
  it('🔴 מעגל כלפי מעלה, לעולם לא מטה', () => {
    expect(agorotToSpokenShekels(4590)).toBe('46')
    expect(agorotToSpokenShekels(4501)).toBe('46')
    expect(agorotToSpokenShekels(4500)).toBe('45')
  })

  it('מחזיר מחרוזת — זה מה שנכנס לשדה number', () => {
    expect(typeof agorotToSpokenShekels(12000)).toBe('string')
  })
})

describe('lineTotal / cartTotals', () => {
  it('מחשב שורה', () => {
    expect(lineTotal({ unit_price_agorot: 4590, quantity: 3 })).toBe(13770)
    expect(lineTotal({ unit_price_agorot: 12000, quantity: 1 })).toBe(12000)
  })

  it('מסכם עגלה עם משלוח', () => {
    const t = cartTotals([
      { unit_price_agorot: 4590, quantity: 2 },   // 9180
      { unit_price_agorot: 12000, quantity: 1 },  // 12000
    ], 3500)
    expect(t.items_total_agorot).toBe(21180)
    expect(t.book_count).toBe(3)
    expect(t.shipping_agorot).toBe(3500)
    expect(t.total_agorot).toBe(24680)
  })

  // ⚠️ book_count הוא הבסיס לתמחור המשלוח — סכום הכמויות, לא מספר השורות
  it('⚠️ book_count סופר עותקים, לא שורות', () => {
    const t = cartTotals([
      { unit_price_agorot: 1000, quantity: 5 },
      { unit_price_agorot: 2000, quantity: 3 },
    ], 0)
    expect(t.book_count).toBe(8)
  })

  it('עגלה ריקה', () => {
    const t = cartTotals([], 0)
    expect(t).toEqual({ items_total_agorot: 0, book_count: 0, shipping_agorot: 0, total_agorot: 0 })
  })

  it('משלוח שלילי נחסם', () => {
    expect(cartTotals([{ unit_price_agorot: 1000, quantity: 1 }], -500).shipping_agorot).toBe(0)
  })

  // 🔴 התרחיש האמיתי: 8 פריטים במחירים שבורים ועוד משלוח.
  // זו העגלה שהייתה מייצרת אי-התאמה מדומה באריתמטיקת נקודה צפה.
  it('🔴 עגלה גדולה במחירים שבורים — סכום מדויק', () => {
    const prices = ['45.90', '29.90', '8.70', '119.50', '1.10', '2.30', '67.35', '250.05']
    const lines = prices.map(p => ({ unit_price_agorot: shekelsToAgorot(p)!, quantity: 1 }))
    const t = cartTotals(lines, shekelsToAgorot('35.50')!)
    // 524.80 + 35.50 = 560.30
    expect(t.items_total_agorot).toBe(52480)
    expect(t.total_agorot).toBe(56030)
    expect(agorotToPaymentString(t.total_agorot)).toBe('560.30')
  })
})

describe('🔴 amountMatches — השער שלפני סימון "שולם"', () => {
  it('תואם בדיוק', () => {
    expect(amountMatches(24680, 24680)).toBe(true)
  })

  // 🔴 אי-שוויון בשני הכיוונים חשוד: חיוב יתר פוגע בלקוח, חיוב חסר פוגע
  // בעמותה. שניהם מעידים שמשהו בזרימה אינו כשורה.
  it('🔴 אגורה אחת הפרש — לא תואם, בשני הכיוונים', () => {
    expect(amountMatches(24681, 24680)).toBe(false)
    expect(amountMatches(24679, 24680)).toBe(false)
  })

  it('אין סובלנות מובנית', () => {
    expect(amountMatches(24700, 24680)).toBe(false)
  })
})
