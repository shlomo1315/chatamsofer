import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import { toVisual } from './pdfBidi'

// ─────────────────────────────────────────────────────────────────────────────
// רשימות איסוף למוקדי החלוקה — PDF להדפסה ולעבודה בשטח.
//
// 🔴 כל מוקד מתחיל בעמוד חדש, תמיד. הרשימה נמסרת לראש המוקד, ושורה של
// מוקד אחר בתחתית הדף שלו היא משפחה שתישלח למקום הלא נכון.
//
// ⚠️ pdf-lib אינו מפרש bidi: מספרים בתוך טקסט עברי מצוירים הפוך. כל טקסט
// עובר toVisual (lib/pdfBidi) לפני הציור. אימות בעין חובה — הרנדרר מטעה.
//
// ⚠️ הטבלה נבנית מימין לשמאל: x מחושב מקצה הדף הימני פנימה.
// ─────────────────────────────────────────────────────────────────────────────

export interface CenterListRow {
  idNumber: string | null
  name: string | null
  phone: string | null
  address: string | null
}

export interface CenterListInput {
  centerName: string
  centerCity: string | null
  distributionName: string
  rows: CenterListRow[]
}

// A4 לרוחב־גובה רגיל
const W = 595.28
const H = 841.89
const MARGIN = 34

// ── פלטה ── שקטה בכוונה: הדף מודפס ונכתב עליו ביד.
const INK = rgb(0.10, 0.11, 0.15)
const MUTED = rgb(0.45, 0.48, 0.55)
const LINE = rgb(0.86, 0.88, 0.92)
const HEAD_BG = rgb(0.94, 0.95, 0.98)
const STRIPE = rgb(0.975, 0.978, 0.985)
const ACCENT = rgb(0.31, 0.27, 0.90)

// ── מבנה הטבלה ──
// 🔴 "האם קיבל" ראשון (הימני ביותר): זו העמודה שמסמנים בה בשטח, והיא
// צריכה ליפול תחת האגודל של מי שמחזיק את הדף.
// ⚠️ הרוחב שהתפנה מעמודת החתימה חולק לשם ולכתובת — שני השדות שנחתכים
// בפועל. טבלה צרה שמותירה שוליים ריקים קשה יותר לקריאה, לא פחות.
// 🔴 סך הרוחב חייב להיות ≤ W-MARGIN*2 (=527.3). חריגה דוחפת את העמודה
// השמאלית אל מחוץ לדף, והכתובת נחתכת בהדפסה בלי שום סימן.
const COLS = [
  { key: 'got', label: 'האם קיבל', width: 52, align: 'center' as const },
  { key: 'id', label: 'תעודת זהות', width: 76, align: 'right' as const },
  { key: 'name', label: 'שם ומשפחה', width: 158, align: 'right' as const },
  { key: 'phone', label: 'טלפון', width: 72, align: 'right' as const },
  { key: 'address', label: 'כתובת', width: 169, align: 'right' as const },
]
const TABLE_W = COLS.reduce((s, c) => s + c.width, 0)

/** מיוצאים לבדיקה — הטסט אוכף שהטבלה נכנסת בדף. */
export const TABLE_WIDTH = TABLE_W
export const PAGE_CONTENT_WIDTH = W - MARGIN * 2

const ROW_H = 20
const HEAD_H = 22
// 🔴 מיקום מוחלט (y מלמטה), לא היסט: הכותרת מסתיימת בקו ב-H-MARGIN-82,
// והטבלה מתחילה מיד מתחתיו. חישוב יחסי כאן נתן ערך שחרג מגובה הדף.
const FIRST_TOP = H - MARGIN - 92   // עמוד ראשון — אחרי הכותרת
const NEXT_TOP = H - MARGIN - 30    // עמודי המשך — אחרי כותרת מוקטנת

/** חיתוך טקסט לרוחב עמודה — עדיף קטוע מאשר גולש על השכנה. */
function fit(font: PDFFont, text: string, size: number, maxW: number): string {
  const s = String(text ?? '').trim()
  if (!s) return ''
  if (font.widthOfTextAtSize(s, size) <= maxW) return s
  let lo = 0, hi = s.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (font.widthOfTextAtSize(s.slice(0, mid) + '…', size) <= maxW) lo = mid
    else hi = mid - 1
  }
  return s.slice(0, lo) + '…'
}

// 🔴 ערך שכולו LTR (ת"ז, טלפון) — נכתב כמות שהוא, **בלי** toVisual.
//
// ⚠️ זו המלכודת שנתפסה באימות בעין: toVisual הופך תווי מספר כדי לתקן מספר
// שמשובץ *בתוך* משפט עברי. תא שמכיל רק מספר אינו בהקשר עברי, וההיפוך שם
// פוגע במקום לתקן — ת"ז 300000000 הוצגה 000000003 והטלפון הוצג הפוך.
// שני המקרים אמיתיים ושונים, ולכן ההכרעה היא לפי תוכן התא.
const LTR_ONLY = /^[\d\s()+\-.,/]+$/

/** ציור טקסט לפי יישור, בתוך תא. */
function drawCell(
  page: PDFPage, font: PDFFont, text: string,
  right: number, width: number, y: number,
  { size = 9, color = INK, align = 'right' as 'right' | 'center' } = {},
) {
  const t = fit(font, text, size, width - 10)
  if (!t) return
  const v = LTR_ONLY.test(t) ? t : toVisual(t)
  const w = font.widthOfTextAtSize(v, size)
  const x = align === 'center' ? right - width / 2 - w / 2 : right - 5 - w
  page.drawText(v, { x, y, size, font, color })
}

/** כותרת הדף — שם המוקד ושם החלוקה. */
function drawHeader(page: PDFPage, font: PDFFont, input: CenterListInput, total: number) {
  const right = W - MARGIN

  // פס מבטא עליון
  page.drawRectangle({ x: MARGIN, y: H - MARGIN - 5, width: W - MARGIN * 2, height: 3.5, color: ACCENT })

  const title = input.centerCity && input.centerCity !== input.centerName
    ? `${input.centerName} · ${input.centerCity}`
    : input.centerName
  const tv = toVisual(title)
  page.drawText(tv, {
    x: right - font.widthOfTextAtSize(tv, 21), y: H - MARGIN - 34,
    size: 21, font, color: INK,
  })

  const sub = toVisual(input.distributionName)
  page.drawText(sub, {
    x: right - font.widthOfTextAtSize(sub, 12), y: H - MARGIN - 53,
    size: 12, font, color: ACCENT,
  })

  // ⚠️ מספר ומילה מצוירים בנפרד — ראו ההסבר ב-drawFooter.
  const cWord = toVisual('משפחות')
  const cNum = String(total)
  const cwW = font.widthOfTextAtSize(cWord, 10)
  const cnW = font.widthOfTextAtSize(cNum, 10)
  page.drawText(cWord, { x: right - cwW, y: H - MARGIN - 70, size: 10, font, color: MUTED })
  page.drawText(cNum, { x: right - cwW - 4 - cnW, y: H - MARGIN - 70, size: 10, font, color: MUTED })

  page.drawLine({
    start: { x: MARGIN, y: H - MARGIN - 82 }, end: { x: W - MARGIN, y: H - MARGIN - 82 },
    thickness: 0.8, color: LINE,
  })
}

/** שורת הכותרות של הטבלה. */
function drawTableHead(page: PDFPage, font: PDFFont, top: number) {
  const tableRight = W - MARGIN
  page.drawRectangle({
    x: tableRight - TABLE_W, y: top - HEAD_H, width: TABLE_W, height: HEAD_H, color: HEAD_BG,
  })
  let right = tableRight
  for (const col of COLS) {
    drawCell(page, font, col.label, right, col.width, top - HEAD_H + 7,
      { size: 9, color: INK, align: col.align })
    right -= col.width
  }
  page.drawLine({
    start: { x: tableRight - TABLE_W, y: top - HEAD_H }, end: { x: tableRight, y: top - HEAD_H },
    thickness: 1, color: rgb(0.75, 0.77, 0.83),
  })
}

/** מספור העמוד — נקי, ממורכז, בתחתית. */
function drawFooter(page: PDFPage, font: PDFFont, n: number, of: number, centerName: string) {
  // ⚠️ "n / of" כטוקן LTR אחד ולא "עמוד n מתוך of": שני מספרים נפרדים
  // בתוך משפט עברי החליפו מקום ויזואלית (1 ו-2 הוצגו הפוך). כאן הם
  // צמודים כמספר אחד, והציור ידני משמאל לימין בתוך תווית עברית קצרה.
  const num = `${n} / ${of}`
  const word = toVisual('עמוד')
  const numW = font.widthOfTextAtSize(num, 9)
  const wordW = font.widthOfTextAtSize(word, 9)
  const gap = 4
  page.drawLine({
    start: { x: MARGIN, y: MARGIN + 24 }, end: { x: W - MARGIN, y: MARGIN + 24 },
    thickness: 0.6, color: LINE,
  })
  // ממורכז: המילה מימין, המספר משמאלה (סדר קריאה עברי).
  const startX = W / 2 - (numW + gap + wordW) / 2
  page.drawText(num, { x: startX, y: MARGIN + 10, size: 9, font, color: MUTED })
  page.drawText(word, { x: startX + numW + gap, y: MARGIN + 10, size: 9, font, color: MUTED })

  // ⚠️ שם המוקד גם בתחתית: דפים שהתפזרו על שולחן חוזרים לערימה הנכונה.
  const cv = toVisual(centerName)
  page.drawText(cv, {
    x: W - MARGIN - font.widthOfTextAtSize(cv, 8), y: MARGIN + 10,
    size: 8, font, color: MUTED,
  })
}

/**
 * מוסיף את עמודי המוקד למסמך קיים.
 *
 * 🔴 מתחיל תמיד בעמוד חדש — ראו ההסבר בראש הקובץ.
 */
export function addCenterPages(pdf: PDFDocument, font: PDFFont, input: CenterListInput): void {
  // מיון א־ב לפי שם. ⚠️ localeCompare עברי — סדר ASCII אינו סדר אלפבית.
  const rows = [...input.rows].sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? ''), 'he'))

  // כמה שורות נכנסות בכל עמוד
  const bodyBottom = MARGIN + 34
  const firstCap = Math.max(1, Math.floor((FIRST_TOP - HEAD_H - bodyBottom) / ROW_H))
  const nextCap = Math.max(1, Math.floor((NEXT_TOP - HEAD_H - bodyBottom) / ROW_H))

  const pages: CenterListRow[][] = []
  if (rows.length <= firstCap) {
    pages.push(rows)
  } else {
    pages.push(rows.slice(0, firstCap))
    for (let i = firstCap; i < rows.length; i += nextCap) pages.push(rows.slice(i, i + nextCap))
  }
  // ⚠️ מוקד בלי שורות מקבל עמוד אחד ריק ולא נעלם: היעדר דף נראה כמו
  // דף שאבד, ומחייב בירור.
  if (!pages.length) pages.push([])

  const tableRight = W - MARGIN
  pages.forEach((pageRows, idx) => {
    const page = pdf.addPage([W, H])
    if (idx === 0) drawHeader(page, font, input, rows.length)
    const top = idx === 0 ? FIRST_TOP : NEXT_TOP

    // בעמודי המשך — כותרת מוקטנת, כדי שיהיה ברור לאיזה מוקד הדף שייך
    if (idx > 0) {
      const t = toVisual(`${input.centerName} — המשך`)
      page.drawText(t, {
        x: tableRight - font.widthOfTextAtSize(t, 11), y: H - MARGIN - 18,
        size: 11, font, color: MUTED,
      })
    }

    drawTableHead(page, font, top)

    let y = top - HEAD_H
    pageRows.forEach((r, i) => {
      y -= ROW_H
      // פסים מתחלפים — העין לא מאבדת שורה ברשימה של 40
      if (i % 2 === 1) {
        page.drawRectangle({
          x: tableRight - TABLE_W, y, width: TABLE_W, height: ROW_H, color: STRIPE,
        })
      }

      let right = tableRight
      for (const col of COLS) {
        const ty = y + 6
        if (col.key === 'got') {
          // 🔴 קוביית סימון — מסמנים בה V ביד במוקד.
          const box = 10.5
          page.drawRectangle({
            x: right - col.width / 2 - box / 2, y: y + (ROW_H - box) / 2,
            width: box, height: box,
            borderColor: rgb(0.55, 0.58, 0.65), borderWidth: 0.9,
            color: rgb(1, 1, 1),
          })
        } else {
          const val = col.key === 'id' ? (r.idNumber ?? '')
            : col.key === 'name' ? (r.name ?? '')
            : col.key === 'phone' ? (r.phone ?? '')
            : (r.address ?? '')
          drawCell(page, font, val, right, col.width, ty, { size: 9, align: col.align })
        }
        right -= col.width
      }

      page.drawLine({
        start: { x: tableRight - TABLE_W, y }, end: { x: tableRight, y },
        thickness: 0.4, color: LINE,
      })
    })

    // מסגרות אנכיות — מפרידות בין העמודות לכל גובה הטבלה
    const tableTop = top - HEAD_H
    const tableBottom = y
    let vx = tableRight
    for (let i = 0; i <= COLS.length; i++) {
      page.drawLine({
        start: { x: vx, y: tableTop + HEAD_H }, end: { x: vx, y: tableBottom },
        thickness: 0.4, color: LINE,
      })
      if (i < COLS.length) vx -= COLS[i].width
    }

    drawFooter(page, font, idx + 1, pages.length, input.centerName)
  })
}

/** רשימת מוקד יחיד — קובץ עצמאי. */
export async function buildCenterListPdf(input: CenterListInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  addCenterPages(pdf, font, input)
  return pdf.save()
}

// ─────────────────────────────────────────────────────────────────────────────
// דף סיכום — כמה כרטיסים צריך בכל מוקד.
// ─────────────────────────────────────────────────────────────────────────────

export interface SummaryRow {
  centerName: string
  centerCity: string | null
  count: number
}

export function addSummaryPage(
  pdf: PDFDocument, font: PDFFont, distributionName: string, rows: SummaryRow[],
): void {
  const page = pdf.addPage([W, H])
  const right = W - MARGIN

  page.drawRectangle({ x: MARGIN, y: H - MARGIN - 5, width: W - MARGIN * 2, height: 3.5, color: ACCENT })

  const t = toVisual('סיכום כרטיסים לפי מוקד')
  page.drawText(t, { x: right - font.widthOfTextAtSize(t, 21), y: H - MARGIN - 34, size: 21, font, color: INK })

  const sub = toVisual(distributionName)
  page.drawText(sub, { x: right - font.widthOfTextAtSize(sub, 12), y: H - MARGIN - 53, size: 12, font, color: ACCENT })

  const total = rows.reduce((s, r) => s + r.count, 0)

  // ── קופסת הסך הכול — הנתון שמזמינים לפיו ──
  const boxY = H - MARGIN - 118
  page.drawRectangle({
    x: MARGIN, y: boxY, width: W - MARGIN * 2, height: 48,
    color: rgb(0.96, 0.96, 1), borderColor: ACCENT, borderWidth: 1,
  })
  // ⚠️ בלי toVisual — מספר שעומד לבדו, ולא בתוך משפט עברי. ראו LTR_ONLY.
  const bigNum = String(total)
  page.drawText(bigNum, {
    x: right - 14 - font.widthOfTextAtSize(bigNum, 26), y: boxY + 15, size: 26, font, color: ACCENT,
  })
  const bigLabel = toVisual('סך הכול כרטיסים')
  page.drawText(bigLabel, {
    x: right - 24 - font.widthOfTextAtSize(bigNum, 26) - font.widthOfTextAtSize(bigLabel, 11),
    y: boxY + 22, size: 11, font, color: INK,
  })
  const cnt = String(rows.length)
  const cntWord = toVisual('מוקדים')
  page.drawText(cnt, { x: MARGIN + 14, y: boxY + 22, size: 11, font, color: MUTED })
  page.drawText(cntWord, {
    x: MARGIN + 14 + font.widthOfTextAtSize(cnt, 11) + 4, y: boxY + 22,
    size: 11, font, color: MUTED,
  })

  // ── טבלת המוקדים ──
  const SUM_COLS = [
    { label: 'מוקד', width: 230, align: 'right' as const },
    { label: 'עיר', width: 160, align: 'right' as const },
    { label: 'כרטיסים', width: 90, align: 'center' as const },
  ]
  const sumW = SUM_COLS.reduce((s, c) => s + c.width, 0)
  let top = boxY - 26

  page.drawRectangle({ x: right - sumW, y: top - HEAD_H, width: sumW, height: HEAD_H, color: HEAD_BG })
  let hx = right
  for (const c of SUM_COLS) {
    drawCell(page, font, c.label, hx, c.width, top - HEAD_H + 7, { size: 9.5, align: c.align })
    hx -= c.width
  }
  page.drawLine({
    start: { x: right - sumW, y: top - HEAD_H }, end: { x: right, y: top - HEAD_H },
    thickness: 1, color: rgb(0.75, 0.77, 0.83),
  })

  // ⚠️ ממוין מהגדול לקטן: זה הסדר שבו מזמינים ומחלקים מלאי.
  const sorted = [...rows].sort((a, b) => b.count - a.count)
  let y = top - HEAD_H
  sorted.forEach((r, i) => {
    y -= ROW_H
    if (i % 2 === 1) page.drawRectangle({ x: right - sumW, y, width: sumW, height: ROW_H, color: STRIPE })
    drawCell(page, font, r.centerName, right, SUM_COLS[0].width, y + 6, { size: 9.5 })
    drawCell(page, font, r.centerCity ?? '', right - SUM_COLS[0].width, SUM_COLS[1].width, y + 6,
      { size: 9.5, color: MUTED })
    drawCell(page, font, String(r.count), right - SUM_COLS[0].width - SUM_COLS[1].width,
      SUM_COLS[2].width, y + 6, { size: 10, align: 'center' })
    page.drawLine({ start: { x: right - sumW, y }, end: { x: right, y }, thickness: 0.4, color: LINE })
  })

  drawFooter(page, font, 1, 1, 'סיכום')
}

/** דף הסיכום כקובץ עצמאי. */
export async function buildSummaryPdf(
  distributionName: string, rows: SummaryRow[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  addSummaryPage(pdf, font, distributionName, rows)
  return pdf.save()
}

/** כל המוקדים בקובץ אחד: סיכום בפתיחה, ואז כל מוקד בעמוד חדש. */
export async function buildAllCentersPdf(
  distributionName: string, centers: CenterListInput[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })

  addSummaryPage(pdf, font, distributionName, centers.map(c => ({
    centerName: c.centerName, centerCity: c.centerCity, count: c.rows.length,
  })))

  // ⚠️ סדר קבוע לפי שם — כדי שהערימה המודפסת תיראה אותו דבר בכל הפקה.
  const sorted = [...centers].sort((a, b) => a.centerName.localeCompare(b.centerName, 'he'))
  for (const c of sorted) addCenterPages(pdf, font, c)

  return pdf.save()
}

// ─────────────────────────────────────────────────────────────────────────────
// שם המשפחה לרשימה: משפחה · בעל · "ו"אישה — "כהן אברהם ושרה".
//
// 🔴 הבעל לפני האישה. קודם הופיע כאן שם האישה בלבד (spouse_name || full_name),
// וכל הרשימות הודפסו עם השם הפרטי השגוי.
//
// ⚠️ במסד: full_name = הבעל · spouse_name = האישה.
// ⚠️ מורכב לפי מה שקיים ולא בתבנית קבועה — כרטסת שחסר בה אחד מהשניים
// (אלמנה, רישום חלקי) לא תניב "כהן ו" או שם ריק.
// ─────────────────────────────────────────────────────────────────────────────
export function centerListName(b: {
  family_name?: string | null; full_name?: string | null; spouse_name?: string | null
}): string {
  const fam = (b.family_name ?? '').trim()
  const husband = (b.full_name ?? '').trim()
  const wife = (b.spouse_name ?? '').trim()
  const people = husband && wife ? `${husband} ו${wife}` : (husband || wife)
  return [fam, people].filter(Boolean).join(' ').trim() || 'ללא שם'
}
