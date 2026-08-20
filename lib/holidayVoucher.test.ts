import { describe, it, expect } from 'vitest'
import {
  buildHolidayVoucher, buildHolidayVouchers,
  HOLIDAY_VOUCHER_DEFAULTS, EMERALD, COPPER, PARCHMENT,
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

describe('ברירות המחדל של המלל', () => {
  it('כוללות את ההנחיה שאי אפשר להחליף מוקד', () => {
    const all = HOLIDAY_VOUCHER_DEFAULTS.instructions.join(' ')
    expect(all).toContain('מוקד אחר')
  })

  it('כוללות הנחיה להביא תעודת זהות', () => {
    expect(HOLIDAY_VOUCHER_DEFAULTS.instructions.join(' ')).toContain('תעודת זהות')
  })
})
