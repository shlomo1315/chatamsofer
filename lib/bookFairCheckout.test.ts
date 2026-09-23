import { describe, it, expect } from 'vitest'
import { validateCheckout, normalizePhone, makeOrderNumber, makeCartToken, type CheckoutItem } from './bookFairCheckout'
import type { TierInput } from './bookFairShipping'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הצ'קאאוט הוא השער האחרון לפני שכסף זז. כל כלל כאן נבדק ביחידה,
// כי כשל בו מתגלה אחרת רק אצל לקוח אמיתי באמצע רכישה.
// ─────────────────────────────────────────────────────────────────────────────

const TIERS: TierInput[] = [
  { min_books: 1,  max_books: 3,    price_agorot: 3500 },
  { min_books: 4,  max_books: null, price_agorot: 5000 },
]

const CITIES = ['city-jlm', 'city-bb']

const ITEM = (over: Partial<CheckoutItem> = {}): CheckoutItem => ({
  book_id: 'b1', title: 'ספר', sku: '1001',
  volumes: 2, unit_price_agorot: 4590, quantity: 1, ...over,
})

const BASE = {
  items: [ITEM()],
  delivery_method: 'pickup' as const,
  customer_name: 'ישראל ישראלי',
  customer_phone: '0501234567',
}

describe('normalizePhone', () => {
  it('מסיר מקפים ורווחים', () => {
    expect(normalizePhone('050-123-4567')).toBe('0501234567')
    expect(normalizePhone(' 050 123 4567 ')).toBe('0501234567')
  })

  it('ממיר קידומת בינלאומית', () => {
    expect(normalizePhone('+972501234567')).toBe('0501234567')
    expect(normalizePhone('972501234567')).toBe('0501234567')
  })

  it('מנקה תווי כיווניות', () => {
    expect(normalizePhone('‏0501234567')).toBe('0501234567')
  })
})

describe('validateCheckout — פרטי הלקוח', () => {
  it('צ׳קאאוט תקין עובר', () => {
    const r = validateCheckout(BASE, TIERS, CITIES)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('דורש שם', () => {
    expect(validateCheckout({ ...BASE, customer_name: '' }, TIERS, CITIES).ok).toBe(false)
    expect(validateCheckout({ ...BASE, customer_name: 'א' }, TIERS, CITIES).ok).toBe(false)
  })

  it('דורש טלפון תקין', () => {
    expect(validateCheckout({ ...BASE, customer_phone: '123' }, TIERS, CITIES).ok).toBe(false)
    expect(validateCheckout({ ...BASE, customer_phone: '' }, TIERS, CITIES).ok).toBe(false)
  })

  // ⚠️ הנייח נפוץ אצל קהל היעד — חסימתו הייתה מונעת רכישה מחלק מהלקוחות
  it('⚠️ מקבל גם טלפון נייח', () => {
    for (const p of ['025551234', '037654321', '086667777']) {
      expect(validateCheckout({ ...BASE, customer_phone: p }, TIERS, CITIES).ok).toBe(true)
    }
  })

  // ⚠️ אימייל אינו חובה: חסימה הייתה מונעת רכישה ממי שאין לו
  it('⚠️ אימייל אופציונלי, אך אם הוזן חייב להיות תקין', () => {
    expect(validateCheckout({ ...BASE, customer_email: '' }, TIERS, CITIES).ok).toBe(true)
    expect(validateCheckout({ ...BASE, customer_email: 'a@b.co.il' }, TIERS, CITIES).ok).toBe(true)
    expect(validateCheckout({ ...BASE, customer_email: 'לא-אימייל' }, TIERS, CITIES).ok).toBe(false)
  })

  it('עגלה ריקה נדחית', () => {
    const r = validateCheckout({ ...BASE, items: [] }, TIERS, CITIES)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain('ריקה')
  })

  it('כמות או מחיר פסולים נדחים', () => {
    expect(validateCheckout({ ...BASE, items: [ITEM({ quantity: 0 })] }, TIERS, CITIES).ok).toBe(false)
    expect(validateCheckout({ ...BASE, items: [ITEM({ quantity: -1 })] }, TIERS, CITIES).ok).toBe(false)
    expect(validateCheckout({ ...BASE, items: [ITEM({ unit_price_agorot: -100 })] }, TIERS, CITIES).ok).toBe(false)
  })
})

describe('🔴 validateCheckout — משלוח', () => {
  const ship = { ...BASE, delivery_method: 'shipping' as const, city_id: 'city-jlm', address_text: 'רחוב הרב קוק 12' }

  it('משלוח תקין', () => {
    const r = validateCheckout(ship, TIERS, CITIES)
    expect(r.ok).toBe(true)
    expect(r.totals!.shipping_agorot).toBe(3500)
  })

  // 🔴 הרשימה סגורה: עיר שאינה בה היא יעד שאיננו משלחים אליו.
  // בדיקה מול הרשימה ולא מול טקסט חופשי מונעת גם התחזות בשדה.
  it('🔴 דוחה עיר שאינה ברשימה הסגורה', () => {
    const r = validateCheckout({ ...ship, city_id: 'city-eilat' }, TIERS, CITIES)
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('משלחים')
  })

  it('דורש עיר וכתובת', () => {
    expect(validateCheckout({ ...ship, city_id: '' }, TIERS, CITIES).ok).toBe(false)
    expect(validateCheckout({ ...ship, address_text: 'רח' }, TIERS, CITIES).ok).toBe(false)
  })

  // ⚠️ איסוף עצמי אינו דורש עיר או כתובת כלל
  it('⚠️ איסוף עצמי — בלי עיר, בלי כתובת, בלי עלות', () => {
    const r = validateCheckout(BASE, TIERS, CITIES)
    expect(r.ok).toBe(true)
    expect(r.totals!.shipping_agorot).toBe(0)
  })

  // 🔴 null ≠ חינם. המשך בסכום 0 היה גורם לעמותה לשלוח על חשבונה.
  it('🔴 אין מדרגת משלוח מתאימה — חוסם ולא ממשיך בחינם', () => {
    const narrow: TierInput[] = [{ min_books: 1, max_books: 2, price_agorot: 3500 }]
    const r = validateCheckout({ ...ship, items: [ITEM({ quantity: 10 })] }, narrow, CITIES)
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('תעריף משלוח')
  })
})

describe('🔴 validateCheckout — הסכומים', () => {
  it('מחשב נכון עגלה מרובת פריטים', () => {
    const r = validateCheckout({
      ...BASE,
      delivery_method: 'shipping', city_id: 'city-bb', address_text: 'רחוב רבי עקיבא 5',
      items: [
        ITEM({ unit_price_agorot: 4590, quantity: 2 }),   // 9180
        ITEM({ book_id: 'b2', unit_price_agorot: 12000, quantity: 3 }),  // 36000
      ],
    }, TIERS, CITIES)

    expect(r.ok).toBe(true)
    expect(r.totals).toEqual({
      items_total_agorot: 45180,
      shipping_agorot: 5000,   // 5 ספרים ⇒ המדרגה השנייה
      total_agorot: 50180,
      book_count: 5,
    })
  })

  // 🔴 המדרגה נקבעת לפי סך העותקים ולא לפי מספר השורות
  it('🔴 המשלוח לפי סך העותקים, לא לפי מספר הכותרים', () => {
    const r = validateCheckout({
      ...BASE,
      delivery_method: 'shipping', city_id: 'city-bb', address_text: 'רחוב רבי עקיבא 5',
      items: [ITEM({ quantity: 4 })],   // כותר אחד, ארבעה עותקים
    }, TIERS, CITIES)
    expect(r.totals!.shipping_agorot).toBe(5000)
  })

  it('אין סכומים כשהוולידציה נכשלה', () => {
    expect(validateCheckout({ ...BASE, customer_name: '' }, TIERS, CITIES).totals).toBeUndefined()
  })
})

describe('makeOrderNumber', () => {
  it('הפורמט BF-שנה-סיומת', () => {
    expect(makeOrderNumber(2026)).toMatch(/^BF-26-[A-Z0-9]{6}$/)
  })

  // ⚠️ המספר מוקרא בקול ומוקלד חזרה — 0/O ו-1/I מבטיחים טעות
  it('⚠️ בלי תווים מתבלבלים (0 O 1 I)', () => {
    for (let i = 0; i < 200; i++) {
      const n = makeOrderNumber(2026)
      expect(n.slice(6)).not.toMatch(/[01OI]/)
    }
  })

  // ⚠️ מספר רץ חושף כמה הזמנות התקבלו ומזמין ניחוש של הזמנות אחרות
  it('⚠️ אינו רץ — שתי קריאות שונות זו מזו', () => {
    const seen = new Set(Array.from({ length: 100 }, () => makeOrderNumber(2026)))
    expect(seen.size).toBeGreaterThan(95)
  })

  it('דטרמיניסטי עם מחולל קבוע', () => {
    expect(makeOrderNumber(2026, () => 0)).toBe('BF-26-222222')
  })
})

describe('makeCartToken', () => {
  // ⚠️ פונקציית השריון במסד דוחה אסימון קצר מ-8 תווים
  it('⚠️ ארוך מ-8 תווים — אחרת המסד דוחה את השריון', () => {
    expect(makeCartToken().length).toBeGreaterThan(8)
  })

  it('ייחודי', () => {
    const seen = new Set(Array.from({ length: 100 }, () => makeCartToken()))
    expect(seen.size).toBe(100)
  })
})

// ⚠️ BASE הוא איסוף עצמי (משלוח תמיד 0) — כאן נדרשת הזמנת משלוח.
const SHIP = { delivery_method: 'shipping' as const, city_id: 'city-jlm', address_text: 'הרב קוק 10' }

describe('המשלוח מחושב לפי כרכים ולא לפי פריטים', () => {
  it('🔴 פריט אחד בן 6 כרכים עובר את מדרגת 1-3', () => {
    // פריט בודד: ספירת פריטים הייתה נותנת 1 ⇒ מדרגה ראשונה (35).
    // ספירת כרכים נותנת 6 ⇒ מדרגה שנייה (50).
    const r = validateCheckout(
      { ...BASE, ...SHIP, items: [ITEM({ volumes: 6, quantity: 1 })] },
      TIERS, CITIES,
    )
    expect(r.ok).toBe(true)
    expect(r.totals!.shipping_agorot).toBe(5000)
  })

  it('פריט בן כרך אחד נשאר במדרגה הראשונה', () => {
    const r = validateCheckout(
      { ...BASE, ...SHIP, items: [ITEM({ volumes: 1, quantity: 1 })] },
      TIERS, CITIES,
    )
    expect(r.totals!.shipping_agorot).toBe(3500)
  })

  it('🔴 הכמות מוכפלת: שני עותקים של סדרה בת 2 כרכים = 4 כרכים', () => {
    const r = validateCheckout(
      { ...BASE, ...SHIP, items: [ITEM({ volumes: 2, quantity: 2 })] },
      TIERS, CITIES,
    )
    expect(r.totals!.shipping_agorot).toBe(5000)
  })

  it('איסוף עצמי — 0 בלי קשר לכרכים', () => {
    const r = validateCheckout(
      { ...BASE, delivery_method: 'pickup', items: [ITEM({ volumes: 20, quantity: 3 })] },
      TIERS, CITIES,
    )
    expect(r.totals!.shipping_agorot).toBe(0)
  })
})
