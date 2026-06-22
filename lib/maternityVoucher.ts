// יצירת שוברי PDF מעוצבים ליולדת — שובר הבראה (בית החלמה) ושובר כרטיס מזון (מוקד).
// פונט Heebo מוטמע. טקסט עברי מסודר ל-RTL ויזואלי דרך lib/rtlText.
import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import { visualRtl, wrapRtl } from './rtlText'
import type { MailAttachment } from './sendMail'

// A4 לאורך
const W = 595.28
const H = 841.89
const MX = 56 // שוליים אופקיים

type Theme = { accent: RGB; soft: RGB; softBorder: RGB; ink: RGB; sub: RGB }
const ROSE: Theme = {
  accent: rgb(0.859, 0.153, 0.467), soft: rgb(0.992, 0.949, 0.972),
  softBorder: rgb(0.965, 0.815, 0.894), ink: rgb(0.059, 0.09, 0.165), sub: rgb(0.392, 0.455, 0.545),
}
const AMBER: Theme = {
  accent: rgb(0.706, 0.325, 0.035), soft: rgb(1, 0.984, 0.922),
  softBorder: rgb(0.988, 0.827, 0.302), ink: rgb(0.059, 0.09, 0.165), sub: rgb(0.392, 0.455, 0.545),
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  return dt.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── עוזרי ציור ────────────────────────────────────────────────────────────────
function rtlRight(page: PDFPage, font: PDFFont, str: string, xRight: number, y: number, size: number, color: RGB) {
  const v = visualRtl(str)
  const w = font.widthOfTextAtSize(v, size)
  page.drawText(v, { x: xRight - w, y, size, font, color })
}
function rtlCenter(page: PDFPage, font: PDFFont, str: string, cx: number, y: number, size: number, color: RGB) {
  const v = visualRtl(str)
  const w = font.widthOfTextAtSize(v, size)
  page.drawText(v, { x: cx - w / 2, y, size, font, color })
}
// יהלום דקורטיבי קטן
function diamond(page: PDFPage, cx: number, cy: number, r: number, color: RGB) {
  page.drawSvgPath(`M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`, { x: cx, y: cy, color, borderWidth: 0 })
}

// ── ציור שובר בודד על עמוד ─────────────────────────────────────────────────────
type VoucherContent = {
  theme: Theme
  badge: string          // כיתוב קטן מעל הכותרת
  title: string          // כותרת ראשית
  highlight?: string     // הדגשה גדולה (למשל "600 ₪")
  highlightSub?: string  // טקסט מתחת להדגשה
  intro: string          // פסקת פתיחה
  rows: [string, string][] // שורות פרטים [תווית, ערך]
  listTitle?: string     // כותרת רשימה (מוקדים)
  list?: string[]        // שורות רשימה
  note: string           // הערה בתחתית
}

function drawVoucher(page: PDFPage, font: PDFFont, c: VoucherContent) {
  const { theme: t } = c
  // רקע
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) })
  // מסגרת חיצונית כפולה
  page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: t.accent, borderWidth: 2, color: rgb(1, 1, 1) })
  page.drawRectangle({ x: 30, y: 30, width: W - 60, height: H - 60, borderColor: t.softBorder, borderWidth: 1, color: rgb(1, 1, 1) })

  // פס כותרת עליון
  const bandH = 96
  const bandY = H - 30 - bandH
  page.drawRectangle({ x: 30, y: bandY, width: W - 60, height: bandH, color: t.accent })
  rtlCenter(page, font, 'היכל החתם סופר', W / 2, bandY + bandH - 40, 24, rgb(1, 1, 1))
  rtlCenter(page, font, 'קופת גמ״ח וחסד · עזר ליולדות', W / 2, bandY + bandH - 66, 12, rgb(1, 0.93, 0.96))

  let y = bandY - 40

  // תג + כותרת
  rtlCenter(page, font, c.badge, W / 2, y, 12, t.accent)
  y -= 30
  rtlCenter(page, font, c.title, W / 2, y, 28, t.ink)
  y -= 16
  // קו מפריד עם יהלומים
  diamond(page, W / 2 - 60, y, 3, t.accent)
  page.drawLine({ start: { x: W / 2 - 52, y }, end: { x: W / 2 + 52, y }, thickness: 1, color: t.softBorder })
  diamond(page, W / 2 + 60, y, 3, t.accent)
  y -= 34

  // הדגשה גדולה (סכום) בתוך תיבה רכה
  if (c.highlight) {
    const boxH = 76
    page.drawRectangle({ x: MX, y: y - boxH + 18, width: W - MX * 2, height: boxH, color: t.soft, borderColor: t.softBorder, borderWidth: 1 })
    rtlCenter(page, font, c.highlight, W / 2, y - 24, 40, t.accent)
    if (c.highlightSub) rtlCenter(page, font, c.highlightSub, W / 2, y - 46, 12, t.sub)
    y -= boxH + 16
  }

  // פסקת פתיחה
  const introLines = wrapRtl(c.intro, W - MX * 2, s => font.widthOfTextAtSize(s, 13))
  for (const ln of introLines) {
    const w = font.widthOfTextAtSize(ln, 13)
    page.drawText(ln, { x: W - MX - w, y, size: 13, font, color: t.sub })
    y -= 21
  }
  y -= 12

  // שורות פרטים
  for (const [label, value] of c.rows) {
    page.drawRectangle({ x: MX, y: y - 8, width: W - MX * 2, height: 30, color: rgb(0.976, 0.98, 0.984) })
    rtlRight(page, font, value || '—', W - MX - 12, y, 14, t.ink)
    rtlRight(page, font, label, MX + 110, y, 12, t.sub)
    y -= 36
  }

  // רשימה (מוקדים)
  if (c.list && c.list.length) {
    y -= 4
    if (c.listTitle) { rtlRight(page, font, c.listTitle, W - MX, y, 13, t.ink); y -= 24 }
    for (const item of c.list) {
      diamond(page, W - MX - 4, y + 4, 2.5, t.accent)
      rtlRight(page, font, item, W - MX - 16, y, 12.5, t.sub)
      y -= 22
    }
    y -= 8
  }

  // קו ניתוק מנוקב + הערה
  y = Math.max(y, 150)
  page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 1, color: t.softBorder, dashArray: [4, 4] })
  y -= 26
  const noteLines = wrapRtl(c.note, W - MX * 2, s => font.widthOfTextAtSize(s, 11))
  for (const ln of noteLines) {
    const w = font.widthOfTextAtSize(ln, 11)
    page.drawText(ln, { x: W - MX - w, y, size: 11, font, color: t.sub })
    y -= 17
  }

  // כותרת תחתית
  rtlCenter(page, font, `הונפק בתאריך ${new Date().toLocaleDateString('he-IL')} · היכל החתם סופר`, W / 2, 52, 10, t.sub)
}

export type VoucherInput = {
  motherName: string
  birthDate?: string | null
  recoveryHome?: string | null
  centers?: { name: string; city?: string | null; address?: string | null }[]
}

async function renderSingle(content: VoucherContent): Promise<string> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  const page = doc.addPage([W, H])
  drawVoucher(page, font, content)
  const bytes = await doc.save()
  return Buffer.from(bytes).toString('base64')
}

export async function buildMaternityVouchers(input: VoucherInput): Promise<MailAttachment[]> {
  // ── שובר 1 — הבראה בבית החלמה ──
  const recoveryB64 = await renderSingle({
    theme: ROSE,
    badge: 'מזל טוב לרגל השמחה!',
    title: 'שובר הבראה ליולדת',
    intro: 'שובר זה מאשר את זכאותך לשהות הבראה בבית ההחלמה לאחר הלידה. נא להציג שובר זה בעת ההגעה לבית ההחלמה לצורך השלמת הרישום ותיאום הפרטים.',
    rows: [
      ['שם היולדת', input.motherName],
      ['תאריך הלידה', fmtDate(input.birthDate)],
      ['בית החלמה', input.recoveryHome || 'ייקבע מול המזכירות'],
    ],
    note: 'לתשומת לבך: יש לתאם מראש את מועד ההגעה מול בית ההחלמה. השובר אישי ואינו ניתן להעברה. לבירורים ניתן לפנות למזכירות היכל החתם סופר.',
  })

  // ── שובר 2 — כרטיס מזון / מוקד ──
  const centerList = (input.centers ?? []).map(c => {
    const place = [c.city, c.address].filter(Boolean).join(', ')
    return place ? `${c.name} — ${place}` : c.name
  })
  const cardB64 = await renderSingle({
    theme: AMBER,
    badge: 'הטבת יולדת',
    title: 'שובר כרטיס מזון',
    highlight: '600 ₪',
    highlightSub: 'כרטיס מזון ליולדת',
    intro: 'כיולדת את זכאית לכרטיס מזון בסך 600 ₪. ניתן לאסוף את הכרטיס באחד ממוקדי החלוקה המפורטים מטה, בהצגת שובר זה ותעודה מזהה.',
    rows: [
      ['שם היולדת', input.motherName],
    ],
    listTitle: centerList.length ? 'מוקדי החלוקה:' : undefined,
    list: centerList.length ? centerList : ['רשימת המוקדים תימסר לך בהמשך על ידי המזכירות'],
    note: 'השובר בתוקף לאיסוף עד 90 יום ממועד ההנפקה. השובר אישי ואינו ניתן להעברה. מומלץ לתאם מראש את מועד האיסוף מול המוקד.',
  })

  return [
    { filename: 'שובר-הבראה-ליולדת.pdf', mimeType: 'application/pdf', contentB64: recoveryB64 },
    { filename: 'שובר-כרטיס-מזון.pdf', mimeType: 'application/pdf', contentB64: cardB64 },
  ]
}
