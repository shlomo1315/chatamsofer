import { describe, it, expect } from 'vitest'
import { findFileInHtml, knownPdfUrl } from './receiptLinkFile'

// מבנה עמוד החשבונית של EZcount, כפי שנשלף בפועל (11.10) — מקוצר.
const EZ_PAGE = `<form method="post" action="./Inv?1xV.eG6T" id="form1">
  <input type="image" name="btDownload" id="btDownload" src="../Images/Idit/Download.svg" />
  <div class="divLogo"><img src="https://secure.ezgo.co.il/Images/7533/Logo.png" /></div>
  <img src="https://secure.ezgo.co.il/Images/Signature_2.png" />
</form>`

describe('knownPdfUrl — EZcount', () => {
  it('עמוד החשבונית ← כתובת ה-PDF עם אותו קוד', () => {
    expect(knownPdfUrl(new URL('https://secure.ezgo.co.il/Main/Inv?1xV.eG6T')))
      .toBe('https://secure.ezgo.co.il/Main/Invoice_Pdf?1xV.eG6T')
  })
  it('כתובת ה-PDF עצמה אינה מומרת שוב (אין לולאה)', () => {
    expect(knownPdfUrl(new URL('https://secure.ezgo.co.il/Main/Invoice_Pdf?1xV.eG6T'))).toBeNull()
  })
  it('אתר אחר — לא נוגעים', () => {
    expect(knownPdfUrl(new URL('https://example.com/Main/Inv?abc'))).toBeNull()
  })
})

describe('findFileInHtml — הלוגו אינו החשבונית', () => {
  const base = new URL('https://secure.ezgo.co.il/Main/Inv?1xV.eG6T')

  it('🔴 הבאג: עמוד EZcount לא מחזיר את הלוגו או את החתימה', () => {
    expect(findFileInHtml(EZ_PAGE, base)).toBeNull()
  })

  it('PDF גובר על תמונה שמופיעה לפניו', () => {
    const html = '<img src="/img/photo.png"><a href="/files/receipt.pdf">הורדה</a>'
    expect(findFileInHtml(html, new URL('https://x.co.il/r'))).toBe('https://x.co.il/files/receipt.pdf')
  })

  it('תמונה רגילה עדיין מתקבלת כשאין PDF', () => {
    const html = '<img src="/logo.png"><img src="/docs/receipt-123.jpg">'
    expect(findFileInHtml(html, new URL('https://x.co.il/r'))).toBe('https://x.co.il/docs/receipt-123.jpg')
  })

  it('מסגרת שעוטפת את המסמך', () => {
    const html = '<img src="/Logo.png"><iframe src="/view?id=9"></iframe>'
    expect(findFileInHtml(html, new URL('https://x.co.il/r'))).toBe('https://x.co.il/view?id=9')
  })
})
