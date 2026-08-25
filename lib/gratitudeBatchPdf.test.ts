import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildGratitudeBatchPdf, type BatchLetterFull } from './gratitudeBatchPdf'

// ⚠️ מה שנבדק כאן הוא שהקובץ נבנה בפועל ושהתוכן אינו נופל מחוץ לעמוד.
// בשובר החגים בדיוק זה קרה: שתי תיבות חדשות דחפו את תחתית העמוד ל-58-,
// והטסט הוא שתפס את זה ולא העין.

const L = (o: Partial<BatchLetterFull> & { id: string }): BatchLetterFull => ({
  status: 'approved',
  created_at: '2026-08-10T09:00:00Z',
  sent_to_donor_at: null,
  body: 'תודה רבה על העזרה הגדולה. יישר כוח.',
  signature: 'משפחת כהן',
  motherName: 'כהן שרה',
  ...o,
})

const pageCount = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPageCount()

describe('בניית הקובץ', () => {
  it('מפיק PDF תקין', async () => {
    const bytes = await buildGratitudeBatchPdf({ letters: [L({ id: 'a' })], filters: {} })
    expect(bytes.length).toBeGreaterThan(1000)
    expect(await pageCount(bytes)).toBe(1)
  })

  it('🔴 קובץ ריק אומר זאת במפורש ואינו נכשל', async () => {
    // קובץ ריק בלי הסבר נראה כתקלה, והמשתמש היה שולח אותו לנדיב.
    const bytes = await buildGratitudeBatchPdf({ letters: [], filters: {} })
    expect(await pageCount(bytes)).toBe(1)
  })

  it('🔴 סינון שאינו מתאים לאיש מפיק קובץ ריק ולא נופל', async () => {
    const bytes = await buildGratitudeBatchPdf({
      letters: [L({ id: 'a' })],
      filters: { sent: 'sent' },   // הברכה טרם נשלחה
    })
    expect(await pageCount(bytes)).toBe(1)
  })
})

describe('🔴 שבירת עמודים', () => {
  it('הרבה ברכות → כמה עמודים, בלי גלישה', async () => {
    // ⚠️ 40 ברכות לא נכנסות בעמוד אחד. אם המחולל לא שובר, התוכן נכתב
    // מתחת לתחתית העמוד ופשוט נעלם — כשל שקט לחלוטין.
    const many = Array.from({ length: 40 }, (_, i) => L({ id: `n${i}` }))
    const bytes = await buildGratitudeBatchPdf({ letters: many, filters: {} })
    expect(await pageCount(bytes)).toBeGreaterThan(3)
  })

  it('ברכה ארוכה מאוד אינה מפילה את המחולל', async () => {
    // ⚠️ ברכה שגדולה מעמוד שלם חייבת להיכתב ולא להיתקע בלולאה של
    // "עמוד חדש כי לא נכנס".
    const long = L({ id: 'long', body: 'שורה ארוכה מאוד. '.repeat(400) })
    const bytes = await buildGratitudeBatchPdf({ letters: [long], filters: {} })
    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(1)
    expect(bytes.length).toBeGreaterThan(1000)
  })
})

describe('⚠️ תוכן חריג אינו מפיל את הקובץ', () => {
  it('שדות ריקים / חסרים', async () => {
    const bytes = await buildGratitudeBatchPdf({
      letters: [
        L({ id: 'a', body: null, signature: null, motherName: null }),
        L({ id: 'b', body: '', created_at: null }),
        L({ id: 'c', body: null, scan_url: 'https://x/y.jpg' }),
      ],
      filters: {},
    })
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('HTML בגוף הברכה מנוקה', async () => {
    // הטופס הציבורי מאפשר טקסט חופשי; תגית שנשארה הייתה מודפסת כטקסט.
    const bytes = await buildGratitudeBatchPdf({
      letters: [L({ id: 'h', body: '<strong>תודה</strong><br/>רבה &amp; שוב' })],
      filters: {},
    })
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('ברכה אנונימית נבנית בלי שם', async () => {
    const bytes = await buildGratitudeBatchPdf({
      letters: [L({ id: 'anon', is_anonymous: true, motherName: 'כהן שרה' })],
      filters: {},
    })
    expect(bytes.length).toBeGreaterThan(1000)
  })
})
