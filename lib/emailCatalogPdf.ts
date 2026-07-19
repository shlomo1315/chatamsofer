// מחולל PDF: מסמך מרוכז של כל נוסחי המיילים במערכת — לעריכה "מול העיניים".
// כל מייל עם: מתי נשלח, מי מקבל, מחלקה, וכל שדה טקסט עם הנוסח האפקטיבי
// (הערוך בהגדרות, ובהיעדרו ברירת המחדל שבקוד). מחליף תגיות HTML פשוטות בטקסט.
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import { wrapText } from './rtlText'
import { EMAIL_CATALOG, GROUP_LABELS, type EmailGroup, type EmailTexts, textOf } from './emailCatalog'
import { DEPARTMENTS, type DepartmentKey } from './departments'

const W = 595.28, H = 841.89, MX = 46
const NAVY = rgb(0.106, 0.196, 0.337)
const GOLD = rgb(0.776, 0.616, 0.176)
const INK = rgb(0.094, 0.129, 0.196)
const SUB = rgb(0.4, 0.44, 0.5)
const LIGHT = rgb(0.96, 0.97, 0.98)

// המרת תו־ספרה לצורה ש-pdf-lib מודד נכון (זהה ל-isoNum בשוברים).
function isoNum(s: string): string { return String(s ?? '') }

// ניקוי טקסט לתצוגה: מסיר תגיות HTML פשוטות ומנרמל רווחים ושורות.
function clean(s: string): string {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(strong|b|em|i|u|a|span|div|p)[^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

interface Ctx { page: PDFPage; font: PDFFont; y: number; pdf: PDFDocument }

function rightText(c: Ctx, text: string, xRight: number, size: number, color = INK) {
  const t = isoNum(text)
  const w = c.font.widthOfTextAtSize(t, size)
  c.page.drawText(t, { x: xRight - w, y: c.y, size, font: c.font, color })
}

// פסקה עטופה מיושרת לימין; מקדמת את c.y ומטפלת גם בשורות מפורשות (\n).
function paragraph(c: Ctx, text: string, size: number, color = INK, lineGap = 5) {
  const maxWidth = W - MX * 2
  for (const rawLine of clean(text).split('\n')) {
    if (!rawLine.trim()) { c.y -= size * 0.6; continue }
    const lines = wrapText(rawLine, maxWidth, s => c.font.widthOfTextAtSize(s, size))
    for (const ln of lines) {
      ensureSpace(c, size + lineGap)
      rightText(c, ln, W - MX, size, color)
      c.y -= size + lineGap
    }
  }
}

// עמוד חדש כשנגמר המקום. מחזיר true אם נוצר עמוד.
function ensureSpace(c: Ctx, needed: number): boolean {
  if (c.y - needed > 60) return false
  c.page = c.pdf.addPage([W, H])
  c.y = H - 56
  return true
}

/** בונה את מסמך ה-PDF של קטלוג המיילים. מחזיר Uint8Array. */
export async function buildEmailCatalogPdf(texts: EmailTexts): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })

  const c: Ctx = { page: pdf.addPage([W, H]), font, y: H - 56, pdf }

  // ── כותרת המסמך ──
  rightText(c, 'נוסחי המיילים במערכת', W - MX, 22, NAVY); c.y -= 28
  rightText(c, 'היכל החתם סופר · מסמך מרוכז לעריכה', W - MX, 11, SUB); c.y -= 16
  const now = new Date()
  rightText(c, `הופק: ${now.toLocaleDateString('he-IL')}`, W - MX, 9, SUB); c.y -= 22

  // קיבוץ המיילים לפי קבוצה, בסדר הקטלוג
  const wired = EMAIL_CATALOG.filter(e => e.wired !== false)
  const groups = [...new Set(wired.map(e => e.group))] as EmailGroup[]

  for (const g of groups) {
    ensureSpace(c, 60)
    // כותרת קבוצה — רקע נייבי
    c.page.drawRectangle({ x: MX, y: c.y - 6, width: W - MX * 2, height: 26, color: NAVY })
    rightText(c, GROUP_LABELS[g] ?? g, W - MX - 10, 14, rgb(1, 1, 1)); c.y -= 34

    for (const email of wired.filter(e => e.group === g)) {
      ensureSpace(c, 80)
      // כותרת המייל + מטא (מתי / מי / מחלקה)
      rightText(c, email.title, W - MX, 15, GOLD); c.y -= 20
      const deptLabel = DEPARTMENTS[email.department as DepartmentKey]?.label ?? email.department
      paragraph(c, `מתי נשלח: ${email.trigger}`, 9.5, SUB, 3)
      paragraph(c, `נמען: ${email.recipient}  ·  מחלקה: ${deptLabel}`, 9.5, SUB, 3)
      c.y -= 6

      // שדות הטקסט
      for (const f of email.fields) {
        ensureSpace(c, 40)
        // תווית השדה (מודגשת, על רקע בהיר)
        const labelSize = 10.5
        c.page.drawRectangle({ x: MX, y: c.y - 4, width: W - MX * 2, height: 17, color: LIGHT })
        rightText(c, f.label + (f.vars?.length ? `   (משתנים: ${f.vars.join(' ')})` : ''), W - MX - 6, labelSize, NAVY)
        c.y -= 22
        // הנוסח האפקטיבי (ערוך בהגדרות, אחרת ברירת מחדל)
        paragraph(c, textOf(texts, email.id, f.key), 11, INK, 5)
        if (f.hint) { paragraph(c, `הערה: ${f.hint}`, 8.5, SUB, 3) }
        c.y -= 6
      }
      c.y -= 12
    }
  }

  return pdf.save()
}
