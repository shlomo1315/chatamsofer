// מחולל PDF: מסמך מרוכז של כל נוסחי המיילים במערכת — לעריכה "מול העיניים".
// כל מייל עם: מתי נשלח, מי מקבל, מחלקה, וכל שדה טקסט עם הנוסח האפקטיבי
// (הערוך בהגדרות, ובהיעדרו ברירת המחדל שבקוד). מחליף תגיות HTML פשוטות בטקסט.
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import { wrapText } from './rtlText'
import { EMAIL_CATALOG, GROUP_LABELS, type EmailGroup, type EmailTexts, textOf } from './emailCatalog'
import { DEPARTMENTS, type DepartmentKey } from './departments'

const W = 595.28, H = 841.89, MX = 40
const PAD = 16                    // ריפוד פנימי בכרטיס
const CARD_L = MX, CARD_R = W - MX
const TXT_R = CARD_R - PAD        // ימין הטקסט בתוך הכרטיס
const TXT_W = (CARD_R - CARD_L) - PAD * 2
const NAVY = rgb(0.106, 0.196, 0.337)
const GOLD = rgb(0.776, 0.616, 0.176)
const INK = rgb(0.12, 0.15, 0.2)
const SUB = rgb(0.42, 0.46, 0.52)
const LIGHT = rgb(0.95, 0.96, 0.98)
const CARD_BORDER = rgb(0.85, 0.87, 0.9)
const FIELD_BG = rgb(0.975, 0.98, 0.99)
const TOP = H - 50, BOTTOM = 50

// המרת תו־ספרה לצורה ש-pdf-lib מודד נכון (זהה ל-isoNum בשוברים).
function isoNum(s: string): string { return String(s ?? '') }

// פענוח base64 ל-Uint8Array — עובד גם בדפדפן (atob) וגם ב-Node (Buffer),
// כדי שהמחולל ירוץ בצד הלקוח ולא יעבור דרך route (מונע חלון אימות בהורדה).
function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

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

function newPage(c: Ctx) { c.page = c.pdf.addPage([W, H]); c.y = TOP }

function rightText(c: Ctx, text: string, xRight: number, size: number, color = INK) {
  const t = isoNum(text)
  const w = c.font.widthOfTextAtSize(t, size)
  c.page.drawText(t, { x: xRight - w, y: c.y, size, font: c.font, color })
}

// עוטף פסקה (כולל \n) לשורות ברוחב נתון. מחזיר את השורות בסדר לוגי.
function wrapParagraph(c: Ctx, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = []
  for (const rawLine of clean(text).split('\n')) {
    if (!rawLine.trim()) { out.push(''); continue }
    out.push(...wrapText(rawLine, maxWidth, s => c.font.widthOfTextAtSize(s, size)))
  }
  return out
}

// ── מדידת גובה מייל (כדי לדעת אם הוא נכנס בעמוד לפני שמציירים) ──
const TITLE_SZ = 14, META_SZ = 9.5, LABEL_SZ = 10, BODY_SZ = 10.5, HINT_SZ = 8.5
const LINE_GAP = 4.5

function measureEmail(c: Ctx, email: typeof EMAIL_CATALOG[number], texts: EmailTexts): number {
  let h = PAD                       // ריפוד עליון
  h += TITLE_SZ + 8                 // כותרת
  h += META_SZ + 5                  // שורת מטא
  h += 10                           // מרווח לפני שדות
  for (const f of email.fields) {
    h += 18                         // תווית השדה (תיבה)
    const bodyLines = wrapParagraph(c, textOf(texts, email.id, f.key), BODY_SZ, TXT_W - 16)
    h += bodyLines.length * (BODY_SZ + LINE_GAP) + 10   // גוף בתוך תיבה + ריפוד
    if (f.hint) h += HINT_SZ + 4
    h += 10                         // מרווח בין שדות
  }
  h += PAD                          // ריפוד תחתון
  return h
}

/** בונה את מסמך ה-PDF של קטלוג המיילים. מחזיר Uint8Array. */
export async function buildEmailCatalogPdf(texts: EmailTexts): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(base64ToBytes(HEEBO_TTF_B64), { subset: true })

  const c: Ctx = { page: pdf.addPage([W, H]), font, y: TOP, pdf }

  // ── כותרת המסמך ──
  rightText(c, 'נוסחי המיילים במערכת', CARD_R, 24, NAVY); c.y -= 30
  rightText(c, 'היכל החתם סופר · מסמך מרוכז לעריכת נוסחי המיילים', CARD_R, 11, SUB); c.y -= 15
  const now = new Date()
  rightText(c, `הופק: ${now.toLocaleDateString('he-IL')} · כל מייל בכרטיס נפרד`, CARD_R, 9, SUB); c.y -= 26

  const wired = EMAIL_CATALOG.filter(e => e.wired !== false)
  const groups = [...new Set(wired.map(e => e.group))] as EmailGroup[]

  for (const g of groups) {
    // כותרת קבוצה — פס נייבי מלא רוחב
    if (c.y - 40 < BOTTOM) newPage(c)
    c.y -= 6
    c.page.drawRectangle({ x: CARD_L, y: c.y - 20, width: CARD_R - CARD_L, height: 28, color: NAVY })
    rightText(c, GROUP_LABELS[g] ?? g, CARD_R - 12, 15, rgb(1, 1, 1))
    c.y -= 40

    for (const email of wired.filter(e => e.group === g)) {
      const cardH = measureEmail(c, email, texts)
      // מייל לא נחתך בין עמודים: אם לא נכנס — עמוד חדש (אלא אם הוא גדול מעמוד שלם).
      if (c.y - cardH < BOTTOM && cardH < TOP - BOTTOM) newPage(c)

      const cardTop = c.y
      // ── תוכן הכרטיס ──
      c.y -= PAD
      // כותרת המייל
      rightText(c, email.title, TXT_R, TITLE_SZ, NAVY); c.y -= TITLE_SZ + 6
      // שורת מטא: מתי / מי / מחלקה
      const deptLabel = DEPARTMENTS[email.department as DepartmentKey]?.label ?? email.department
      rightText(c, `מתי: ${email.trigger}  ·  נמען: ${email.recipient}  ·  מחלקה: ${deptLabel}`, TXT_R, META_SZ, SUB)
      c.y -= META_SZ + 12

      for (const f of email.fields) {
        // תווית השדה — פס בהיר
        c.page.drawRectangle({ x: CARD_L + PAD, y: c.y - 5, width: TXT_W, height: 17, color: LIGHT })
        const labelTxt = f.label + (f.vars?.length ? `   ·  משתנים: ${f.vars.join(' ')}` : '')
        rightText(c, labelTxt, TXT_R - 6, LABEL_SZ, NAVY)
        c.y -= 20

        // גוף הנוסח — בתוך תיבה עדינה
        const bodyLines = wrapParagraph(c, textOf(texts, email.id, f.key), BODY_SZ, TXT_W - 16)
        const boxH = bodyLines.length * (BODY_SZ + LINE_GAP) + 8
        c.page.drawRectangle({
          x: CARD_L + PAD, y: c.y - boxH + BODY_SZ, width: TXT_W, height: boxH,
          color: FIELD_BG, borderColor: CARD_BORDER, borderWidth: 0.5,
        })
        c.y -= 2
        for (const ln of bodyLines) {
          if (ln) rightText(c, ln, TXT_R - 8, BODY_SZ, INK)
          c.y -= BODY_SZ + LINE_GAP
        }
        c.y -= 4
        if (f.hint) { rightText(c, `הערה: ${f.hint}`, TXT_R - 6, HINT_SZ, SUB); c.y -= HINT_SZ + 4 }
        c.y -= 8
      }

      c.y -= PAD
      // ── מסגרת הכרטיס (מציירים בסוף, כשיודעים את הגובה בפועל) ──
      c.page.drawRectangle({
        x: CARD_L, y: c.y, width: CARD_R - CARD_L, height: cardTop - c.y,
        borderColor: CARD_BORDER, borderWidth: 1,
      })
      // פס זהב דק בראש הכרטיס — הפרדה ויזואלית
      c.page.drawRectangle({ x: CARD_L, y: cardTop - 3, width: CARD_R - CARD_L, height: 3, color: GOLD })
      c.y -= 18   // רווח בין כרטיסים
    }
  }

  return pdf.save()
}
