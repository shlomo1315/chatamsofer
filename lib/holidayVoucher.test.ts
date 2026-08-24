import { describe, it, expect } from 'vitest'
import {
  buildHolidayVoucher, buildHolidayVouchers,
  HOLIDAY_VOUCHER_DEFAULTS, EMERALD, COPPER, PARCHMENT,
  HOLIDAY_HEADLINE, HOLIDAY_FRAME_STYLE, HOLIDAY_SECTION_TITLES,
} from './holidayVoucher'
import { NAVY, GOLD, CREAM } from './maternityVoucher'
import { PDFDocument } from 'pdf-lib'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 שובר החגים חייב להיראות שונה משובר הלידה.
//
// ⚠️ שני השוברים מגיעים לאותן משפחות. בלי הבדל ויזואלי חד אי אפשר לדעת
// ביד איזה שובר מחזיקים — במיוחד במוקד חלוקה עמוס.
// ─────────────────────────────────────────────────────────────────────────────

const data = {
  familyName: 'משפחת ישראלי',
  centerLabel: 'ירושלים · אזור נווה צבי',
  centerAddress: 'רחוב הרב סורוצקין 12',
  centerHours: "יום ג' 10:00–14:00",
  centerPhone: '02-1234567',
  texts: HOLIDAY_VOUCHER_DEFAULTS,
}

/** מרחק בין שני צבעים — 0 = זהים. */
const dist = (a: { red: number; green: number; blue: number }, b: typeof a) =>
  Math.abs(a.red - b.red) + Math.abs(a.green - b.green) + Math.abs(a.blue - b.blue)

describe('🔴 פלטת החגים נבדלת מפלטת הלידה', () => {
  it('הצבע הראשי אינו הכחול של הלידה', () => {
    expect(dist(EMERALD, NAVY)).toBeGreaterThan(0.2)
  })

  it('צבע ההדגשה אינו הזהב של הלידה', () => {
    expect(dist(COPPER, GOLD)).toBeGreaterThan(0.15)
  })

  it('⚠️ הראשי ירוק ולא כחול — הירוק גדול מהכחול', () => {
    // ההבחנה המהותית: NAVY כחול (blue > green), EMERALD ירוק (green > blue).
    expect(EMERALD.green).toBeGreaterThan(EMERALD.blue)
    expect(NAVY.blue).toBeGreaterThan(NAVY.green)
  })

  it('הרקע שונה מהרקע של הלידה', () => {
    expect(dist(PARCHMENT, CREAM)).toBeGreaterThan(0)
  })
})

describe('buildHolidayVoucher', () => {
  it('מייצר PDF תקין', async () => {
    const pdf = await buildHolidayVoucher(data)
    expect(pdf.length).toBeGreaterThan(1000)
    // חתימת PDF
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
  })

  it('⚠️ עובד גם בלי כתובת/שעות/טלפון — השדות אופציונליים', async () => {
    const pdf = await buildHolidayVoucher({
      familyName: 'משפחת כהן',
      centerLabel: 'חיפה',
      texts: HOLIDAY_VOUCHER_DEFAULTS,
    })
    expect(pdf.length).toBeGreaterThan(1000)
  })

  it('מלל מותאם אינו מפיל את הבנייה', async () => {
    const pdf = await buildHolidayVoucher({
      ...data,
      texts: { title: 'שובר', intro: 'טקסט', instructions: ['א'], footer: 'סיום' },
    })
    expect(pdf.length).toBeGreaterThan(1000)
  })
})

describe('buildHolidayVouchers — איחוד', () => {
  it('מאחד כמה שוברים לקובץ אחד', async () => {
    const pdf = await buildHolidayVouchers([data, { ...data, familyName: 'משפחת לוי' }])
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
    // ⚠️ נספר דרך pdf-lib ולא ב-regex על הבייטים: המסמך דחוס, וספירת
    // "/Type /Page" בטקסט גולמי מחזירה תוצאה שאינה יציבה.
    const loaded = await PDFDocument.load(pdf)
    expect(loaded.getPageCount()).toBe(2)
  })

  it('רשימה ריקה מחזירה PDF ריק ולא קורסת', async () => {
    const pdf = await buildHolidayVouchers([])
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
  })
})

describe('🔴 הבחנה שעובדת גם בהדפסת שחור-לבן', () => {
  // הצבע לבדו אינו מספיק: רוב המשפחות מדפיסות בשחור-לבן, ושם ירוק וכחול
  // הופכים לאותו אפור. ההבדל חייב להיות מבני וטקסטואלי.

  it('הכותרת הראשית שונה מזו של שובר הלידה', () => {
    expect(HOLIDAY_HEADLINE).not.toBe('היכל החתם סופר')
    expect(HOLIDAY_HEADLINE).toContain('חג')
  })

  it('המסגרת מקווקוות ולא רציפה — נבדל במישוש ובעין גם בלי צבע', () => {
    expect(HOLIDAY_FRAME_STYLE).toBe('dashed')
  })

  it('כותרות הסעיפים אינן זהות לאלה של שובר הלידה', () => {
    // ⚠️ "מוקד החלוקה שלכם" הופיע בשני השוברים. הנוסח כאן ייחודי לחגים.
    const titles = Object.values(HOLIDAY_SECTION_TITLES)
    expect(titles.every(t => t.trim().length > 0)).toBe(true)
    expect(HOLIDAY_SECTION_TITLES.center).toContain('חג')
  })

  it('⚠️ הכותרת הענקית לא דוחפת את השובר לעמוד שני', async () => {
    // המקרה המסוכן: מוקד עם שם ארוך + כל השדות + הרבה הוראות.
    // נבדק גם ה-Y התחתון ולא רק מספר העמודים: תוכן יכול לחרוג מהמסגרת
    // המקווקוות בלי לפתוח עמוד שני, ואז הוא נדפס על הקו או מתחתיו.
    const pdf = await buildHolidayVoucher({
      familyName: 'משפחת אברמוביץ-רוזנברג',
      distributionName: 'חלוקת חגי תשרי תשפ״ז',
      centerLabel: 'מוקד ירושלים — אזור שמואל הנביא — משפחת שטרנבוך',
      centerAddress: 'רחוב יחזקאל 44, קומה ב׳, דירה 12',
      centerHours: "ימי שני ושלישי 19:00–21:00",
      centerPhone: '02-1234567',
      amount: 1500,
      phones: ['0527101315', '0501234567'],
      texts: HOLIDAY_VOUCHER_DEFAULTS,
    })
    const loaded = await PDFDocument.load(Buffer.from(pdf))
    expect(loaded.getPageCount()).toBe(1)

    const { lastBottomY, BOTTOM_LIMIT } = await import('./holidayVoucher')
    expect(lastBottomY).toBeGreaterThan(BOTTOM_LIMIT)
  })
})

describe('ברירות המחדל של המלל', () => {
  it('כוללות את ההנחיה שאי אפשר להחליף מוקד', () => {
    const all = HOLIDAY_VOUCHER_DEFAULTS.instructions.join(' ')
    expect(all).toContain('מוקד אחר')
  })

  it('כוללות הנחיה להביא תעודת זהות', () => {
    expect(HOLIDAY_VOUCHER_DEFAULTS.instructions.join(' ')).toContain('תעודת זהות')
  })
})
