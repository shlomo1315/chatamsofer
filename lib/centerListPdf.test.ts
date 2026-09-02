import { describe, it, expect } from 'vitest'
import {
  buildCenterListPdf, buildSummaryPdf, buildAllCentersPdf,
  centerListName, TABLE_WIDTH, PAGE_CONTENT_WIDTH,
} from './centerListPdf'

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({
  idNumber: String(300000000 + i),
  name: `משפחה ${String.fromCharCode(1488 + (i % 22))}`,
  phone: '0501234567',
  address: `רחוב הרב קוק ${i + 1}, ירושלים`,
}))

// 🔴 הבאג שנתפס רק באימות בעין: הטבלה חרגה ב-51 נקודות מרוחב הדף, והעמודה
// השמאלית (כתובת) יצאה אל מחוץ לנייר — בהדפסה היא פשוט נחתכת, בלי סימן.
describe('רוחב הטבלה', () => {
  it('אינו חורג משטח הכתיבה של הדף', () => {
    expect(TABLE_WIDTH).toBeLessThanOrEqual(PAGE_CONTENT_WIDTH)
  })
})

// 🔴 הבאג שדווח מהשטח: כל הרשימות הודפסו עם השם הפרטי של האישה, כי
// הקוד העדיף spouse_name על full_name. הבעל חייב להופיע ראשון.
describe('centerListName — משפחה, בעל, ואז האישה', () => {
  it('הניסוח המלא', () => {
    expect(centerListName({ family_name: 'כהן', full_name: 'אברהם', spouse_name: 'שרה' }))
      .toBe('כהן אברהם ושרה')
  })

  it('הבעל לפני האישה, לא להפך', () => {
    const s = centerListName({ family_name: 'לוי', full_name: 'יעקב', spouse_name: 'בילה' })
    expect(s.indexOf('יעקב')).toBeLessThan(s.indexOf('בילה'))
  })

  // ⚠️ כרטסת שחסר בה אחד מהשניים לא תניב "כהן ו" או שם ריק.
  it('בלי אישה — רק הבעל', () => {
    expect(centerListName({ family_name: 'כהן', full_name: 'אברהם', spouse_name: null }))
      .toBe('כהן אברהם')
  })

  it('בלי בעל — נופל לשם האישה (אלמנה)', () => {
    expect(centerListName({ family_name: 'כהן', full_name: null, spouse_name: 'שרה' }))
      .toBe('כהן שרה')
  })

  it('רווחים מיותרים אינם יוצרים "כהן ו"', () => {
    expect(centerListName({ family_name: 'כהן', full_name: '  ', spouse_name: 'שרה' }))
      .toBe('כהן שרה')
  })

  it('כרטסת ריקה אינה מחזירה מחרוזת ריקה', () => {
    expect(centerListName({ family_name: null, full_name: null, spouse_name: null }))
      .toBe('ללא שם')
  })
})

describe('בניית הקבצים', () => {
  it('רשימת מוקד נוצרת', async () => {
    const bytes = await buildCenterListPdf({
      centerName: 'אזור מאה שערים', centerCity: 'ירושלים',
      distributionName: 'חלוקת תשרי', rows: rows(40),
    })
    expect(bytes.length).toBeGreaterThan(1000)
  })

  // ⚠️ מוקד ריק מקבל עמוד ולא נעלם — דף חסר נראה כדף שאבד.
  it('מוקד ללא משפחות אינו קורס', async () => {
    const bytes = await buildCenterListPdf({
      centerName: 'מוקד ריק', centerCity: null,
      distributionName: 'חלוקת תשרי', rows: [],
    })
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('דף הסיכום נוצר', async () => {
    const bytes = await buildSummaryPdf('חלוקת תשרי', [
      { centerName: 'א', centerCity: 'ירושלים', count: 500 },
      { centerName: 'ב', centerCity: 'בני ברק', count: 300 },
    ])
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('הקובץ המאוחד כולל את כל המוקדים', async () => {
    const bytes = await buildAllCentersPdf('חלוקת תשרי', [
      { centerName: 'א', centerCity: 'ירושלים', distributionName: 'x', rows: rows(3) },
      { centerName: 'ב', centerCity: 'בני ברק', distributionName: 'x', rows: rows(60) },
    ])
    expect(bytes.length).toBeGreaterThan(2000)
  })
})
