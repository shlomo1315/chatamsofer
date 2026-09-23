import { describe, it, expect } from 'vitest'
import { resolveShippingTier, shippingCost, validateTiers, tierLabel, totalVolumes, type TierInput } from './bookFairShipping'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 תעריף המשלוח לפי *כמות ספרים* — לא לפי יעד ולא לפי סכום.
//
// הסיכון המרכזי: טבלת מדרגות עם פער. לקוח שהזמין 5 ספרים, ואין מדרגה
// שמכסה 5, פשוט לא יכול להשלים הזמנה — ואין שום דבר במסך שמסביר לו למה.
// לכן validateTiers רץ במסך ההגדרות ומונע שמירה של טבלה פגומה מלכתחילה.
// ─────────────────────────────────────────────────────────────────────────────

const TIERS: TierInput[] = [
  { min_books: 1,  max_books: 3,    price_agorot: 3500 },
  { min_books: 4,  max_books: 10,   price_agorot: 5000 },
  { min_books: 11, max_books: null, price_agorot: 0    },  // חינם מ-11
]

describe('resolveShippingTier', () => {
  it('בוחר את המדרגה הנכונה', () => {
    expect(resolveShippingTier(1, TIERS)).toBe(3500)
    expect(resolveShippingTier(3, TIERS)).toBe(3500)
    expect(resolveShippingTier(4, TIERS)).toBe(5000)
    expect(resolveShippingTier(10, TIERS)).toBe(5000)
  })

  it('המדרגה הפתוחה תופסת כל כמות גדולה', () => {
    expect(resolveShippingTier(11, TIERS)).toBe(0)
    expect(resolveShippingTier(500, TIERS)).toBe(0)
  })

  it('גבולות כוללים משני הצדדים', () => {
    expect(resolveShippingTier(3, TIERS)).toBe(3500)   // הקצה העליון
    expect(resolveShippingTier(4, TIERS)).toBe(5000)   // הקצה התחתון הבא
  })

  // 🔴 ההבחנה המרכזית: null ≠ 0.
  // 0 = "משלוח חינם" · null = "לא יודע כמה לגבות".
  // הצגת חינם על טבלה שגויה תגרום לעמותה לשלוח על חשבונה.
  it('🔴 מחזיר null כשאין מדרגה — לא 0', () => {
    expect(resolveShippingTier(5, [{ min_books: 1, max_books: 3, price_agorot: 3500 }])).toBeNull()
    expect(resolveShippingTier(1, [])).toBeNull()
  })

  it('🔴 חינם (0) מובחן מ"אין מדרגה" (null)', () => {
    expect(resolveShippingTier(11, TIERS)).toBe(0)
    expect(resolveShippingTier(11, TIERS)).not.toBeNull()
  })

  it('כמות לא חוקית', () => {
    expect(resolveShippingTier(0, TIERS)).toBeNull()
    expect(resolveShippingTier(-1, TIERS)).toBeNull()
    expect(resolveShippingTier(NaN, TIERS)).toBeNull()
  })

  it('עובד גם כשהמדרגות אינן ממוינות', () => {
    const shuffled = [TIERS[2], TIERS[0], TIERS[1]]
    expect(resolveShippingTier(2, shuffled)).toBe(3500)
    expect(resolveShippingTier(7, shuffled)).toBe(5000)
    expect(resolveShippingTier(50, shuffled)).toBe(0)
  })
})

describe('shippingCost — לפי שיטת האיסוף', () => {
  // ⚠️ איסוף עצמי אינו נוגע בטבלת המדרגות כלל
  it('⚠️ איסוף עצמי תמיד חינם, גם בלי מדרגות מוגדרות', () => {
    expect(shippingCost('pickup', 3, TIERS)).toBe(0)
    expect(shippingCost('pickup', 100, [])).toBe(0)
  })

  it('משלוח לפי המדרגות', () => {
    expect(shippingCost('shipping', 2, TIERS)).toBe(3500)
    expect(shippingCost('shipping', 20, TIERS)).toBe(0)
  })

  it('משלוח בלי מדרגה מתאימה — null', () => {
    expect(shippingCost('shipping', 5, [{ min_books: 1, max_books: 3, price_agorot: 3500 }])).toBeNull()
  })
})

describe('🔴 validateTiers — השער שמונע טבלה פגומה', () => {
  it('טבלה תקינה עוברת', () => {
    const r = validateTiers(TIERS)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  // 🔴 התקלה הגרועה ביותר: לקוח עם 4 ספרים לא יכול להזמין, בלי הסבר
  it('🔴 תופס פער', () => {
    const r = validateTiers([
      { min_books: 1, max_books: 3,    price_agorot: 3500 },
      { min_books: 5, max_books: null, price_agorot: 5000 },
    ])
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('פער')
    expect(r.errors.join(' ')).toContain('4')
  })

  it('🔴 תופס פער רחב ומתאר את הטווח', () => {
    const r = validateTiers([
      { min_books: 1,  max_books: 3,    price_agorot: 3500 },
      { min_books: 10, max_books: null, price_agorot: 5000 },
    ])
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('4-9')
  })

  // ⚠️ חפיפה מסוכנת יותר מפער: היא אינה חוסמת, אלא גובה מחיר שתלוי
  // בסדר המיון — כלומר שרירותי מנקודת מבט המשתמש
  it('⚠️ תופס חפיפה', () => {
    const r = validateTiers([
      { min_books: 1, max_books: 5,    price_agorot: 3500 },
      { min_books: 4, max_books: null, price_agorot: 5000 },
    ])
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('חפיפה')
  })

  // 🔴 בלי מדרגה פתוחה, הזמנה גדולה נתקעת בלי הסבר
  it('🔴 דורש מדרגה אחרונה פתוחה', () => {
    const r = validateTiers([
      { min_books: 1, max_books: 3,  price_agorot: 3500 },
      { min_books: 4, max_books: 10, price_agorot: 5000 },
    ])
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('ומעלה')
  })

  it('דורש התחלה מספר אחד', () => {
    const r = validateTiers([{ min_books: 2, max_books: null, price_agorot: 3500 }])
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('כרך אחד')
  })

  it('מדרגה פתוחה באמצע נפסלת', () => {
    const r = validateTiers([
      { min_books: 1, max_books: null, price_agorot: 3500 },
      { min_books: 4, max_books: null, price_agorot: 5000 },
    ])
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('האחרונה')
  })

  it('טבלה ריקה נפסלת', () => {
    expect(validateTiers([]).ok).toBe(false)
  })

  it('פוסל ערכים לא חוקיים', () => {
    expect(validateTiers([{ min_books: 0,   max_books: null, price_agorot: 100 }]).ok).toBe(false)
    expect(validateTiers([{ min_books: 1,   max_books: null, price_agorot: -1  }]).ok).toBe(false)
    expect(validateTiers([{ min_books: 1.5, max_books: null, price_agorot: 100 }]).ok).toBe(false)
    expect(validateTiers([{ min_books: 5,   max_books: 2,    price_agorot: 100 }]).ok).toBe(false)
  })

  // מדרגה יחידה פתוחה היא הטבלה המינימלית התקינה — תעריף אחיד
  it('מדרגה אחת פתוחה = תעריף אחיד, תקין', () => {
    expect(validateTiers([{ min_books: 1, max_books: null, price_agorot: 3500 }]).ok).toBe(true)
  })

  // 🔴 כל טבלה שעוברת ולידציה חייבת לכסות כל כמות סבירה
  it('🔴 טבלה שעברה ולידציה מכסה כל כמות מ-1 עד 200', () => {
    expect(validateTiers(TIERS).ok).toBe(true)
    for (let n = 1; n <= 200; n++) {
      expect(resolveShippingTier(n, TIERS)).not.toBeNull()
    }
  })
})

describe('tierLabel', () => {
  it('טווח', () => {
    expect(tierLabel({ min_books: 1, max_books: 3 })).toBe('1-3')
  })
  it('פתוח', () => {
    expect(tierLabel({ min_books: 11, max_books: null })).toBe('11 ומעלה')
  })
  it('ערך בודד', () => {
    expect(tierLabel({ min_books: 5, max_books: 5 })).toBe('5')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מחירון היריד בפועל — לפי כרכים, כפי שנמסר.
//
//   עד 3 כרכים   — 20 ₪
//   4 עד 6       — 25 ₪
//   7 עד 13      — 35 ₪
//   מ-14 ומעלה   — 45 ₪, ותוספת 10 ₪ לכל 3 כרכים נוספים
//
// ⚠️ הטבלה הזו נעולה בטסט בכוונה: שינוי מקרי במדרגות משנה כסף אמיתי
// בכל הזמנה, ובלי בדיקה הוא מתגלה רק בדוח החודשי.
// ─────────────────────────────────────────────────────────────────────────────
const FAIR_TIERS: TierInput[] = [
  { min_books: 1,  max_books: 3,    price_agorot: 2000 },
  { min_books: 4,  max_books: 6,    price_agorot: 2500 },
  { min_books: 7,  max_books: 13,   price_agorot: 3500 },
  { min_books: 14, max_books: null, price_agorot: 4500, step_volumes: 3, step_agorot: 1000 },
]

describe('מחירון היריד — שלוש המדרגות הקבועות', () => {
  it('עד 3 כרכים — 20 ₪', () => {
    expect(resolveShippingTier(1, FAIR_TIERS)).toBe(2000)
    expect(resolveShippingTier(3, FAIR_TIERS)).toBe(2000)
  })

  it('4 עד 6 כרכים — 25 ₪', () => {
    expect(resolveShippingTier(4, FAIR_TIERS)).toBe(2500)
    expect(resolveShippingTier(6, FAIR_TIERS)).toBe(2500)
  })

  it('7 עד 13 כרכים — 35 ₪', () => {
    expect(resolveShippingTier(7, FAIR_TIERS)).toBe(3500)
    expect(resolveShippingTier(13, FAIR_TIERS)).toBe(3500)
  })

  it('הגבולות מדויקים — כרך אחד מעביר מדרגה', () => {
    expect(resolveShippingTier(3, FAIR_TIERS)).toBe(2000)
    expect(resolveShippingTier(4, FAIR_TIERS)).toBe(2500)
    expect(resolveShippingTier(6, FAIR_TIERS)).toBe(2500)
    expect(resolveShippingTier(7, FAIR_TIERS)).toBe(3500)
    expect(resolveShippingTier(13, FAIR_TIERS)).toBe(3500)
    expect(resolveShippingTier(14, FAIR_TIERS)).toBe(4500)
  })
})

describe('מחירון היריד — המדרגה הפתוחה (10 ₪ לכל 3 כרכים)', () => {
  it('14-16 כרכים — 45 ₪', () => {
    expect(resolveShippingTier(14, FAIR_TIERS)).toBe(4500)
    expect(resolveShippingTier(15, FAIR_TIERS)).toBe(4500)
    expect(resolveShippingTier(16, FAIR_TIERS)).toBe(4500)
  })

  it('17-19 כרכים — 55 ₪', () => {
    expect(resolveShippingTier(17, FAIR_TIERS)).toBe(5500)
    expect(resolveShippingTier(19, FAIR_TIERS)).toBe(5500)
  })

  it('20-22 כרכים — 65 ₪', () => {
    expect(resolveShippingTier(20, FAIR_TIERS)).toBe(6500)
    expect(resolveShippingTier(22, FAIR_TIERS)).toBe(6500)
  })

  it('🔴 סדרה גדולה מתומחרת ולא נופלת למחיר קבוע', () => {
    // 90 כרכים: (90-14+1)=77 → ceil(77/3)-1 = 25 קפיצות → 45+250
    expect(resolveShippingTier(90, FAIR_TIERS)).toBe(4500 + 25 * 1000)
  })
})

describe('totalVolumes — ספירת כרכים בעגלה', () => {
  it('🔴 כפל בכמות: שני עותקים של סדרה בת 6 הם 12 כרכים', () => {
    expect(totalVolumes([{ volumes: 6, quantity: 2 }])).toBe(12)
  })

  it('מסכם שורות מעורבות', () => {
    // שו"ת חת"ס (6 כרכים) + 2 חוברות בנות כרך
    expect(totalVolumes([
      { volumes: 6, quantity: 1 },
      { volumes: 1, quantity: 2 },
    ])).toBe(8)
  })

  it('🔴 פריט אחד בן 6 כרכים אינו נספר כספר אחד', () => {
    const vols = totalVolumes([{ volumes: 6, quantity: 1 }])
    expect(vols).toBe(6)
    // לפי כרכים — מדרגה שנייה (25 ₪), ולא הראשונה (20 ₪)
    expect(resolveShippingTier(vols, FAIR_TIERS)).toBe(2500)
  })

  it('volumes חסר או פסול נספר ככרך אחד', () => {
    expect(totalVolumes([{ volumes: 0, quantity: 3 }])).toBe(3)
    expect(totalVolumes([{ volumes: NaN, quantity: 2 }])).toBe(2)
  })

  it('עגלה ריקה — אפס', () => {
    expect(totalVolumes([])).toBe(0)
  })
})

describe('validateTiers — שדות המדרגה הפתוחה', () => {
  it('המחירון בפועל תקין', () => {
    expect(validateTiers(FAIR_TIERS).ok).toBe(true)
  })

  it('🔴 קפיצה בלי תוספת נדחית — אחרת היא נבלעת כמחיר קבוע', () => {
    const r = validateTiers([
      { min_books: 1, max_books: null, price_agorot: 2000, step_volumes: 3 },
    ])
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('גם את גודל הקפיצה וגם את התוספת')
  })

  it('תוספת מדורגת במדרגה סגורה נדחית', () => {
    const r = validateTiers([
      { min_books: 1, max_books: 3, price_agorot: 2000, step_volumes: 3, step_agorot: 1000 },
      { min_books: 4, max_books: null, price_agorot: 2500 },
    ])
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('רק במדרגה הפתוחה')
  })
})
