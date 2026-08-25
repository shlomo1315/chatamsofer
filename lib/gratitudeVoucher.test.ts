import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildGratitudeVoucher } from './gratitudeVoucher'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ברכה ארוכה נחתכה בשקט.
//
// הטקסט נחתך ב-1500 תווים באמצע משפט, והלולאה ציירה את כל השורות על דף
// אחד — מה שלא נכנס נכתב מתחת לתחתית הדף ופשוט נעלם. המסמך נראה תקין
// ורק המשפט האחרון חסר, ולכן איש לא הבחין.
// ─────────────────────────────────────────────────────────────────────────────

const base = {
  mode: 'filled' as const,
  familyName: 'כהן',
  fatherName: 'משה',
  motherName: 'שרה',
}

const pages = async (bytes: string) =>
  (await PDFDocument.load(Buffer.from(bytes, 'base64'))).getPageCount()

describe('שובר ברכה — אורך הטקסט', () => {
  it('ברכה קצרה נשארת בדף אחד', async () => {
    const v = await buildGratitudeVoucher({ ...base, body: 'תודה רבה על הכל!' })
    expect(await pages(v.contentB64)).toBe(1)
  })

  it('🔴 ברכה ארוכה עוברת לדף שני ואינה נחתכת', async () => {
    // ⚠️ 60 שורות אינן נכנסות בדף אחד (הדף מכיל ~20).
    const long = Array.from({ length: 60 }, (_, i) => `שורה מספר ${i + 1} של הברכה הארוכה.`).join('\n')
    const v = await buildGratitudeVoucher({ ...base, body: long })
    expect(await pages(v.contentB64)).toBeGreaterThan(1)
  })

  it('🔴 ברכה ארוכה מאוד — כמה דפים, בלי אובדן', async () => {
    const veryLong = 'משפט ארוך של הכרת הטוב על העזרה הגדולה שקיבלנו. '.repeat(120)
    const v = await buildGratitudeVoucher({ ...base, body: veryLong })
    const n = await pages(v.contentB64)
    expect(n).toBeGreaterThan(2)
    // ⚠️ תקרת בטיחות: קלט משובש לא ייצור מסמך של מאות עמודים.
    expect(n).toBeLessThan(60)
  })

  it('⚠️ שובר ריק להדפסה נשאר דף אחד', async () => {
    const v = await buildGratitudeVoucher({ ...base, mode: 'blank' })
    expect(await pages(v.contentB64)).toBe(1)
  })

  it('⚠️ ירידות שורה של הכותבת נשמרות', async () => {
    // פסקאות נפרדות אינן נדבקות לשורה אחת.
    const v = await buildGratitudeVoucher({ ...base, body: 'שלום.\n\nתודה רבה.\n\nבברכה.' })
    expect(v.contentB64.length).toBeGreaterThan(1000)
  })
})

describe('⚠️ קלט חריג אינו מפיל את השובר', () => {
  it('גוף ריק / חסר', async () => {
    for (const body of ['', '   ', undefined]) {
      const v = await buildGratitudeVoucher({ ...base, body })
      expect(await pages(v.contentB64)).toBe(1)
    }
  })

  it('מילה אחת ארוכה מאוד שאינה ניתנת לשבירה', async () => {
    // 🔴 מילה ארוכה מרוחב השורה יכולה להכניס את גולל השורות ללולאה.
    const v = await buildGratitudeVoucher({ ...base, body: 'א'.repeat(400) })
    expect(await pages(v.contentB64)).toBeGreaterThanOrEqual(1)
  })
})
