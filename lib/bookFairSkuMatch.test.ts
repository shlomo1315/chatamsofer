import { describe, it, expect } from 'vitest'
import { digitsOnly, skuKey, skuMatches, matchBookBySku } from './bookFairSkuMatch'

// מק"טים אמיתיים מהקטלוג (04.10.2026)
const BOOKS = [
  { sku: '0201', title: 'דרשות חתם סופר' },
  { sku: '0205', title: 'תורת משה 5 כרכים' },
  { sku: '0301-01', title: 'חת"ס על הש"ס — ברכות' },
  { sku: '0301-14', title: 'חת"ס על הש"ס — יבמות חלק א' },
  { sku: '0916', title: 'קורות חייו' },
]

describe('digitsOnly', () => {
  it('משאיר ספרות בלבד', () => {
    expect(digitsOnly('0301-01')).toBe('030101')
    expect(digitsOnly(' 0201 ')).toBe('0201')
  })

  it('מנטרל תווים ששוברים שאילתת .or()', () => {
    // 🔴 פסיק/נקודה בקלט הרחיבו את השאילתה לשורות אחרות
    expect(digitsOnly('0201,sku.eq.0205')).toBe('02010205')
    expect(digitsOnly('%')).toBe('')
  })

  it('קלט ריק או חסר', () => {
    expect(digitsOnly('')).toBe('')
    expect(digitsOnly(null)).toBe('')
    expect(digitsOnly(undefined)).toBe('')
  })
})

describe('skuKey — אפסים מובילים', () => {
  it('מתלכד בין צורות כתיבה', () => {
    expect(skuKey('201')).toBe('201')
    expect(skuKey('0201')).toBe('201')
    expect(skuKey('00201')).toBe('201')
  })

  it('מסיר גם את המקף', () => {
    expect(skuKey('0301-01')).toBe('30101')
    expect(skuKey('030101')).toBe('30101')
  })
})

describe('skuMatches', () => {
  it('🔴 201 מוצא את 0201 — הפער שהפיל מתקשרים', () => {
    expect(skuMatches('201', '0201')).toBe(true)
  })

  it('המק"ט המלא ממשיך לעבוד', () => {
    expect(skuMatches('0201', '0201')).toBe(true)
  })

  it('🔴 030101 מוצא את 0301-01 — 14 הכרכים היו חסומים', () => {
    expect(skuMatches('030101', '0301-01')).toBe(true)
    expect(skuMatches('30101', '0301-01')).toBe(true)
  })

  it('ספרים שונים אינם מתלכדים', () => {
    expect(skuMatches('0201', '0205')).toBe(false)
    expect(skuMatches('0301', '0301-01')).toBe(false)
    expect(skuMatches('0301-01', '0301-14')).toBe(false)
  })

  it('הקשה ריקה לא מתאימה לכלום', () => {
    expect(skuMatches('', '0201')).toBe(false)
    expect(skuMatches('0201', '')).toBe(false)
    expect(skuMatches('', '')).toBe(false)
    expect(skuMatches(null, null)).toBe(false)
  })
})

describe('matchBookBySku', () => {
  it('מוצא לפי הקשה מקוצרת', () => {
    expect(matchBookBySku('201', BOOKS)?.sku).toBe('0201')
    expect(matchBookBySku('916', BOOKS)?.sku).toBe('0916')
  })

  it('🔴 כרך מתוך 14 — בלי מקף', () => {
    expect(matchBookBySku('030101', BOOKS)?.title).toBe('חת"ס על הש"ס — ברכות')
    expect(matchBookBySku('030114', BOOKS)?.sku).toBe('0301-14')
  })

  it('מק"ט שאינו קיים', () => {
    expect(matchBookBySku('9999', BOOKS)).toBeNull()
    expect(matchBookBySku('', BOOKS)).toBeNull()
  })

  it('⚠️ אינו מחזיר "מתחיל ב-" — 0301 אינו 0301-01', () => {
    // 0301 עצמו אינו ברשימה (is_active=false), ואסור שההקשה תיפול
    // על הכרך הראשון ותזמין ספר אחר ממה שהתבקש.
    expect(matchBookBySku('0301', BOOKS)).toBeNull()
  })
})
