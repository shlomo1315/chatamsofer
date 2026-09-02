import { describe, it, expect } from 'vitest'
import { buildCenterListPdf, buildSummaryPdf, buildAllCentersPdf, TABLE_WIDTH, PAGE_CONTENT_WIDTH } from './centerListPdf'

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
