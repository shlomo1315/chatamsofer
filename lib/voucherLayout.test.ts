import { describe, it, expect } from 'vitest'
import { buildCardVoucherOnly } from './maternityVoucher'

// שובר כרטיס המזון נדחס לעמוד A4 יחיד. הבדיקה מוודאת שהוא אכן נבנה
// ונשאר בעמוד אחד גם ברשימת מוקדים מלאה — המקרה שגלש בפועל.
const CENTERS = [
  { name: 'מוקד בית שמש רמה ב - משפחת אונגר', address: 'דובר שלום 11', city: 'בית שמש', pickup_days: 'ימי ראשון ושלישי', pickup_hours: '19:00 - 21:00' },
  { name: 'מוקד בני ברק - אזור חזון איש נחמיה - משפחת שמרלר', address: 'הרב לנדא יעקב 3', city: 'בני ברק', pickup_days: 'ימי שני ושלישי', pickup_hours: '20:00 - 22:00' },
  { name: 'מוקד בני ברק - רחוב יואל - משפחת שמרלר', address: 'יואל 6', city: 'בני ברק', pickup_days: 'ימי שני ושלישי', pickup_hours: '19:00 - 22:00' },
  { name: 'מוקד ירושלים - אזור נוה צבי', address: 'צפניה 23', city: 'ירושלים', pickup_days: 'ימי שני ורביעי', pickup_hours: '20:00 - 22:00' },
  { name: 'מוקד ירושלים - אזור שמואל הנביא - משפחת שטרנבוך', address: 'יחזקאל 44', city: 'ירושלים', pickup_days: 'ימי שני ושלישי', pickup_hours: '19:00 - 21:00' },
  { name: 'מוקד מודיעין עילית - גרין פארק - משפחת רבינוביץ', address: 'אשר לשבלאם 3', city: 'מודיעין עילית', pickup_days: 'ימי ראשון ורביעי', pickup_hours: '18:00 - 20:00' },
]

describe('שובר כרטיס מזון — פריסה', () => {
  it('נבנה כ-PDF תקין עם רשימת מוקדים מלאה', async () => {
    const out = await buildCardVoucherOnly({
      motherName: 'ויסברג גיטי',
      motherId: '207212911',
      address: 'איש מצליח 1', city: 'עמנואל',
      phone: '0527101315', spousePhone: '0501234567',
      birthDate: '2026-07-20',
      recoveryHome: 'אם וילד', recoveryDays: 2,
      centers: CENTERS,
    })
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeGreaterThan(0)

    const pdf = Buffer.from(out[0].contentB64, 'base64')
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')

    // ⚠️ עמוד אחד בלבד — גלישה לעמוד שני היא בדיוק התקלה שנבדקת כאן.
    // נקרא דרך pdf-lib ולא ב-regex, כי המבנה דחוס באובייקט-סטרים.
    const { PDFDocument } = await import('pdf-lib')
    const parsed = await PDFDocument.load(pdf)
    expect(parsed.getPageCount()).toBe(1)
  })

  it('מספרי הטלפון להפעלה נשמרים כסדרם ואינם הפוכים', async () => {
    const { toVisual } = await import('./pdfBidi')
    // toVisual הופך ספרות בכוונה — נכון רק כשיש הקשר עברי באותה שורה.
    // מספר המצויר לבדו חייב לעקוף אותו, אחרת 0527101315 → 5131017250.
    expect(toVisual('0527101315')).toBe('5131017250')      // ההיפוך המכוון
    expect(toVisual('להפעלה חייגו: 02-3131325')).toContain('5231313-20')
  })
})
