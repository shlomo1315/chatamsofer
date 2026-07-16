// שוברי PDF מעוצבים ליולדת — שובר כרטיס מזון ושובר הבראה (בית החלמה).
// פונט Heebo מוטמע. הטקסט נכתב בסדר לוגי (מנוע ה-PDF מיישם RTL בעצמו).
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'fs'
import { join } from 'path'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import { wrapText } from './rtlText'
import type { MailAttachment } from './sendMail'

// מיוצאים לשימוש חוזר בשוברים נוספים (lib/gratitudeVoucher.ts) — אותו עיצוב בדיוק.
export const W = 595.28
export const H = 841.89
export const MX = 42

// ערכת צבעים — כחול כהה + זהב (חגיגי ומכובד)
export const NAVY = rgb(0.106, 0.196, 0.337)
const NAVY_SOFT = rgb(0.929, 0.945, 0.972)
export const GOLD = rgb(0.776, 0.616, 0.176)
export const GOLD_SOFT = rgb(0.984, 0.957, 0.882)
export const INK = rgb(0.094, 0.129, 0.196)
export const SUB = rgb(0.353, 0.4, 0.467)
const RED = rgb(0.7, 0.106, 0.106)
export const CREAM = rgb(0.996, 0.992, 0.973)

// תאריך לועזי בפורמט DD/MM/YYYY (בנייה ידנית — toLocaleDateString גרם להיפוך/בלבול).
function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const yyyy = dt.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

// המרת מספר לגימטריה עברית (1–999)
const GEM_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
const GEM_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
const GEM_HUND = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק']
function gematria(n: number): string {
  let s = GEM_HUND[Math.floor(n / 100)] || ''
  let r = n % 100
  if (r === 15) s += 'טו'
  else if (r === 16) s += 'טז'
  else { s += GEM_TENS[Math.floor(r / 10)] || ''; s += GEM_ONES[r % 10] || '' }
  return s
}
// מוסיף גרש/גרשיים לפי הכללים
function withPunct(s: string): string {
  if (s.length === 1) return s + '׳'
  return s.slice(0, -1) + '״' + s.slice(-1)
}
// תאריך עברי מלא (גימטריה) — ז׳ תמוז תשפ״ו
export function hebrewDate(d: Date): string {
  try {
    const day = parseInt(new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric' }).format(d), 10)
    const year = parseInt(new Intl.DateTimeFormat('en-u-ca-hebrew', { year: 'numeric' }).format(d), 10)
    const month = new Intl.DateTimeFormat('he-u-ca-hebrew', { month: 'long' }).format(d).replace(/[֑-ׇ]/g, '')
    const dayG = withPunct(gematria(day))
    const yearG = withPunct(gematria(year % 1000)) // 5786 → 786 → תשפ״ו
    return `${dayG} ${month} ${yearG}`
  } catch { return '' }
}
// חלקי שורת "הונפק בתאריך": טקסט עברי (ימני) + תאריך לועזי כמספר עצמאי (משמאלו).
// המספר מצויר בנפרד כדי שיוצג תקין (כמו ערכי שדות בתיבת הפרטים), ולא הפוך.
function issueDateParts(): { prefix: string; greg: string } {
  const now = new Date()
  const greg = fmtDate(now.toISOString())
  const he = hebrewDate(now)
  return { prefix: he ? `הונפק בתאריך ${he}  ·  ` : 'הונפק בתאריך ', greg }
}

// לוגו (best-effort — אם לא נמצא, מדלגים)
export function loadLogo(): Buffer | null {
  try { return readFileSync(join(process.cwd(), 'public', 'logo.png')) } catch { return null }
}

export type Ctx = { page: PDFPage; font: PDFFont; logo: PDFImage | null }

// כפיית כיוון שמאל-לימין על מספרים המשובצים בטקסט עברי (כתובות, שעות, תאריכים),
// כדי שלא יוצגו הפוכים (למשל "יחזקאל 44"→"44 יחזקאל", "21:00"→"00:12").
// משתמשים ב-LEFT-TO-RIGHT OVERRIDE (U+202D) … POP (U+202C) — כפייה חזקה שמכובדת
// על ידי יותר צופי PDF מאשר ISOLATE (U+2066), שלא תמיד נתמך.
export function isoNum(s: string): string {
  // עוטפים כל מספר/טווח ב-LRO…POP; בטווח שעות ("19:00 - 21:00") מסירים את הרווחים
  // הפנימיים כדי שכל הטווח יהיה טוקן LTR צמוד אחד — כך הוא מוצג תקין בכל צופה PDF
  // (בדיוק כמו מספר השובר "01072026.2911" שמוצג נכון).
  return String(s ?? '').replace(/\d[\d.,:/]*(?:\s*[-–]\s*\d[\d.,:/]*)*/g, m => `‭${m.replace(/\s*([-–])\s*/g, ' $1 ').replace(/\s+/g, ' ')}‬`)
}
// מדידת רוחב כולל בידוד מספרים
export function tw(c: Ctx, text: string, size: number): number {
  return c.font.widthOfTextAtSize(isoNum(text), size)
}

// ── עוזרי ציור (טקסט לוגי, יישור לימין) ─────────────────────────────────────────
export function rightText(c: Ctx, text: string, xRight: number, y: number, size: number, color: RGB) {
  const t = isoNum(text)
  const w = c.font.widthOfTextAtSize(t, size)
  c.page.drawText(t, { x: xRight - w, y, size, font: c.font, color })
}
export function centerText(c: Ctx, text: string, cx: number, y: number, size: number, color: RGB) {
  const t = isoNum(text)
  const w = c.font.widthOfTextAtSize(t, size)
  c.page.drawText(t, { x: cx - w / 2, y, size, font: c.font, color })
}
// פסקה עטופה, יישור לימין; מחזיר את ה-y שאחרי הפסקה
export function paragraph(c: Ctx, text: string, xRight: number, y: number, maxWidth: number, size: number, color: RGB, lineGap = 6): number {
  const lines = wrapText(text, maxWidth, s => c.font.widthOfTextAtSize(s, size))
  for (const ln of lines) { rightText(c, ln, xRight, y, size, color); y -= size + lineGap }
  return y
}
// תיבת מסגרת מעוגלת (קו זהב)
export function roundedBox(c: Ctx, x: number, y: number, w: number, h: number, border: RGB, fill?: RGB) {
  const r = 10
  c.page.drawRectangle({ x, y, width: w, height: h, color: fill ?? rgb(1, 1, 1), borderColor: border, borderWidth: 1.2 })
  // עיגול פינות מדומה — ריבועים לבנים קטנים בפינות (אפקט עדין); מדלגים לפשטות
  void r
}
// פס דקורטיבי זהב עם מעוין
export function goldDivider(c: Ctx, cx: number, y: number, half = 70) {
  c.page.drawLine({ start: { x: cx - half, y }, end: { x: cx + half, y }, thickness: 1, color: GOLD })
  c.page.drawSvgPath('M 0 -3 L 3 0 L 0 3 L -3 0 Z', { x: cx, y, color: GOLD, borderWidth: 0 })
}

// כותרת עליונה משותפת (לוגו + שם הארגון על רקע כחול)
export function drawHeader(c: Ctx, subtitle: string): number {
  c.page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM })
  // מסגרת חיצונית כפולה (זהב + כחול)
  c.page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: GOLD, borderWidth: 2.5, color: CREAM })
  c.page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: NAVY, borderWidth: 0.8, color: CREAM })

  // בס"ד
  rightText(c, 'בס"ד', W - 34, H - 44, 10, SUB)

  const bandH = 92
  const bandY = H - 34 - bandH
  c.page.drawRectangle({ x: 24, y: bandY, width: W - 48, height: bandH, color: NAVY })
  c.page.drawRectangle({ x: 24, y: bandY, width: W - 48, height: 4, color: GOLD })

  // לוגו בצד ימין של הפס; שם הארגון ממורכז לרוחב העמוד
  if (c.logo) {
    const dim = 64
    c.page.drawImage(c.logo, { x: W - 34 - dim, y: bandY + (bandH - dim) / 2, width: dim, height: dim })
  }
  centerText(c, 'היכל החתם סופר', W / 2, bandY + bandH - 40, 26, rgb(1, 1, 1))
  centerText(c, subtitle, W / 2, bandY + bandH - 64, 13, GOLD_SOFT)
  return bandY - 28
}

// תיבת פרטים עם כותרת מודגשת ושורות label/value
export function detailsBox(c: Ctx, title: string, y: number, rows: [string, string][]): number {
  const rowH = 20
  const titleH = 26
  const boxH = titleH + rows.length * rowH + 14
  const x = MX
  const w = W - MX * 2
  roundedBox(c, x, y - boxH, w, boxH, GOLD, rgb(1, 1, 1))
  // כותרת
  c.page.drawRectangle({ x, y: y - titleH, width: w, height: titleH, color: NAVY })
  rightText(c, title, x + w - 14, y - titleH + 8, 13, rgb(1, 1, 1))

  let ry = y - titleH - 18
  const valRight = x + w - 16
  for (const [label, value] of rows) {
    // קודם הכותרת (label) בצד ימין, ואחריה הערך (value) משמאלה — "שם היולדת: ויסברג גיטי"
    const labelText = `${label}: `
    rightText(c, labelText, valRight, ry, 12, NAVY)
    const lW = tw(c, labelText, 12)
    rightText(c, value || '—', valRight - lW, ry, 12, INK)
    ry -= rowH
  }
  return y - boxH - 16
}

// תיבת מוקדים — לכל מוקד: שם, כתובת, ימים ושעות
type Center = { name: string; city?: string | null; address?: string | null; pickup_days?: string | null; pickup_hours?: string | null }
function centersBox(c: Ctx, title: string, y: number, centers: Center[]): number {
  const x = MX, w = W - MX * 2
  const titleH = 24
  const items = centers.filter(cn => cn.name)
  const perH = 23
  const contentH = items.length ? items.length * perH : 22
  const boxH = titleH + contentH + 8
  roundedBox(c, x, y - boxH, w, boxH, GOLD, rgb(1, 1, 1))
  c.page.drawRectangle({ x, y: y - titleH, width: w, height: titleH, color: NAVY })
  rightText(c, title, x + w - 14, y - titleH + 7, 12.5, rgb(1, 1, 1))

  let ry = y - titleH - 15
  if (!items.length) {
    rightText(c, 'רשימת המוקדים תימסר לכם על ידי המזכירות', x + w - 16, ry, 11, SUB)
  } else {
    for (const cn of items) {
      // שורה 1: נקודת זהב + שם המוקד
      c.page.drawSvgPath('M 0 -2.2 L 2.2 0 L 0 2.2 L -2.2 0 Z', { x: x + w - 9, y: ry + 4, color: GOLD, borderWidth: 0 })
      rightText(c, cn.name, x + w - 18, ry, 11.5, NAVY)
      // שורה 2: כתובת · ימים · שעות. את השעות (טווח רב-ספרתי) מציירים כטוקן נפרד כדי שלא
      // יתהפכו — טווח שעות המשובץ בתוך טקסט עברי מוצג הפוך במנוע ה-PDF (כמו מספר טלפון).
      const addr = [cn.address, cn.city].filter(Boolean).join(', ')
      const hours = (cn.pickup_hours || '').trim()
      const hebPart = [addr, cn.pickup_days].filter(Boolean).join('  ·  ')
      let dx = x + w - 18
      if (hebPart) { rightText(c, hebPart, dx, ry - 12.5, 9, SUB); dx -= tw(c, hebPart, 9) }
      if (hours) rightText(c, (hebPart ? '  ·  ' : '') + hours, dx, ry - 12.5, 9, SUB)
      ry -= perH
    }
  }
  return y - boxH - 14
}

// ── מסמך שובר בודד ──────────────────────────────────────────────────────────────
type VoucherInput = {
  motherName: string
  motherId?: string | null
  address?: string | null
  city?: string | null
  phone?: string | null
  spousePhone?: string | null
  birthDate?: string | null
  recoveryHome?: string | null
  recoveryDays?: number | null
  serial?: string | null
  centers?: { name: string; city?: string | null; address?: string | null; pickup_days?: string | null; pickup_hours?: string | null }[]
}

// שורת מספר סידורי לשובר (פינה שמאלית עליונה).
// התווית (עברית) והמספר מצוירים בנפרד — המספר עומד בפני עצמו ולכן מוצג תקין (DDMMYYYY.XXXX),
// ולא הפוך כפי שקרה כשהוא היה משובץ בתוך מחרוזת עברית.
function serialLine(c: Ctx, serial: string | null | undefined, y: number) {
  if (!serial) return
  const label = 'מס׳ שובר: '
  rightText(c, label, MX + 150, y, 9, SUB)
  const lW = tw(c, label, 9)
  rightText(c, serial, MX + 150 - lW, y, 9, SUB)
}

// שורת "הונפק בתאריך": חלק עברי מימין + תאריך לועזי כמספר עצמאי משמאלו (מוצג תקין).
export function drawIssueDate(c: Ctx, y: number) {
  const { prefix, greg } = issueDateParts()
  rightText(c, prefix, W - MX, y, 10, SUB)
  const pW = tw(c, prefix, 10)
  rightText(c, greg, W - MX - pW, y, 10, SUB)
}

async function renderFoodCard(input: VoucherInput): Promise<string> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  const logoBytes = loadLogo()
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null
  const page = doc.addPage([W, H])
  const c: Ctx = { page, font, logo }

  let y = drawHeader(c, 'אגף עזר ליולדות')

  // תאריך + מספר סידורי
  drawIssueDate(c, y)
  serialLine(c, input.serial, y)
  y -= 24

  // כותרת ראשית
  centerText(c, 'שובר לקבלת כרטיס לרכישת אוכל מוכן', W / 2, y, 21, NAVY)
  y -= 11
  goldDivider(c, W / 2, y); y -= 21

  // לכבוד
  rightText(c, `לכבוד משפחת ${input.motherName} הנכבדה`, W - MX, y, 13, INK); y -= 21

  // פסקת פתיחה (ללא סכום בתוך המשפט — הסכום מוצג כשדה נפרד כדי שיוצג תקין)
  y = paragraph(c,
    'הננו שמחים לבשר לכם כי הנהלת "היכל החתם סופר" — אגף עזר ליולדות, אישרה את בקשתכם לקבלת כרטיס מזון טעון לרכישת מזון מוכן ליולדת, כמפורט להלן.',
    W - MX, y, W - MX * 2, 12, SUB, 5)
  y -= 3

  // סכום הכרטיס — תיבת הדגשה (המספר לבדו, מוצג תקין)
  const amH = 32
  c.page.drawRectangle({ x: MX, y: y - amH, width: W - MX * 2, height: amH, color: GOLD_SOFT, borderColor: GOLD, borderWidth: 1 })
  // מצויר כך שייקרא "600 ש"ח": המספר לבדו (מוצג תקין) מימין, ו-ש"ח לשמאלו
  const amtLabel = 'סכום טעינת הכרטיס: '
  rightText(c, amtLabel, W - MX - 14, y - 21, 14, NAVY)
  const amtLabelW = c.font.widthOfTextAtSize(amtLabel, 14)
  const numRight = W - MX - 14 - amtLabelW - 4
  rightText(c, '600', numRight, y - 22, 18, NAVY)
  const numW = c.font.widthOfTextAtSize('600', 18)
  rightText(c, 'ש"ח', numRight - numW - 12, y - 21, 14, NAVY)
  y = y - amH - 10

  // אזהרה אדומה
  const warnH = 40
  c.page.drawRectangle({ x: MX, y: y - warnH, width: W - MX * 2, height: warnH, color: rgb(0.996, 0.953, 0.953), borderColor: RED, borderWidth: 1 })
  let wy = y - 15
  wy = paragraph(c, 'חובה להדפיס שובר זה ולהביאו למוקד החלוקה לצורך קבלת הכרטיס — לא נוכל להעניק כרטיס בלי אישור זה!', W - MX - 12, wy, W - MX * 2 - 24, 12, RED, 4)
  y = y - warnH - 12

  // פרטי היולדת
  y = detailsBox(c, 'פרטי היולדת', y, [
    ['שם היולדת', input.motherName],
    ['תעודת זהות', input.motherId || '—'],
    ['כתובת', input.address || '—'],
    ['עיר', input.city || '—'],
    ['טלפון', input.phone || '—'],
    ['תאריך לידת התינוק', fmtDate(input.birthDate)],
  ])

  // מוקדי האיסוף — שם, כתובת, ימים ושעות. ניתן לגשת לכל אחד מהם.
  y = centersBox(c, 'מוקדי איסוף הכרטיס', y, input.centers ?? [])
  y = paragraph(c, 'תוכלו לבחור בכל מוקד לקבלת הכרטיס.', W - MX, y, W - MX * 2, 11, NAVY, 3)
  y -= 4

  // ── הפעלת הכרטיס — תיבת הדגשה (חובה לפני השימוש) ──
  {
    const innerRight = W - MX - 14
    const innerW = W - MX * 2 - 28
    const measure = (s: string) => c.font.widthOfTextAtSize(s, 11)
    // מספרי הטלפון המעודכנים של היולדת/בעלה — רק מהם ניתן להפעיל את הכרטיס
    const phones = [input.phone, input.spousePhone].map(p => String(p ?? '').trim()).filter(Boolean)
    const uniqPhones = [...new Set(phones)]

    const lineA = 'לאחר קבלת הכרטיס מהמוקד, חובה להפעילו בהתקשרות למוקד הטלפוני, ולפעול לפי ההנחיות:'
    const lineB = uniqPhones.length
      ? 'שימו לב: המערכת מזהה אתכם אוטומטית לפי מספרי הטלפון המעודכנים אצלנו — ההפעלה אפשרית אך ורק בשיחה מהמספרים הבאים:'
      : 'שימו לב: המערכת מזהה אתכם אוטומטית לפי מספרי הטלפון המעודכנים במערכת — ההפעלה אפשרית אך ורק בשיחה ממספרים אלו.'
    const wA = wrapText(lineA, innerW, measure)
    const wB = wrapText(lineB, innerW, measure)
    const titleH = 22
    const lineH = 15
    const boxH = titleH + (wA.length + 1 /*שורת המוקד*/ + wB.length + (uniqPhones.length ? 1 : 0)) * lineH + 14

    c.page.drawRectangle({ x: MX, y: y - boxH, width: W - MX * 2, height: boxH, color: GOLD_SOFT, borderColor: GOLD, borderWidth: 1.2 })
    c.page.drawRectangle({ x: MX, y: y - titleH, width: W - MX * 2, height: titleH, color: NAVY })
    c.page.drawRectangle({ x: MX, y: y - titleH, width: W - MX * 2, height: 3, color: GOLD })
    rightText(c, 'הפעלת הכרטיס — חובה לפני השימוש!', innerRight, y - titleH + 7, 12, rgb(1, 1, 1))

    let ay = y - titleH - 13
    for (const ln of wA) { rightText(c, ln, innerRight, ay, 11, INK); ay -= lineH }

    // שורת המוקד — המספר הרב-ספרתי מצויר כטוקן נפרד כדי שלא יתהפך (מספר משובץ בעברית מוצג הפוך ב-PDF)
    {
      let x = innerRight
      const s1 = 'להפעלה חייגו למוקד: '
      rightText(c, s1, x, ay, 11, INK); x -= tw(c, s1, 11)
      rightText(c, '02-3131325', x, ay, 11, NAVY); x -= tw(c, '02-3131325', 11)
      rightText(c, ' שלוחה 1', x, ay, 11, INK)
      ay -= lineH
    }

    for (const ln of wB) { rightText(c, ln, innerRight, ay, 11, RED); ay -= lineH }

    // מספרי הטלפון המעודכנים — מצוירים כמקשה אחת של ספרות (ללא עברית מעורבת) כדי שיוצגו תקין
    if (uniqPhones.length) {
      centerText(c, uniqPhones.join('     '), W / 2, ay, 12, NAVY); ay -= lineH
    }

    y = y - boxH - 12
  }

  // הערות בתחתית
  y = paragraph(c,
    'הכרטיס בתוקף לשימוש עד 6 שבועות ממועד הלידה, ורק עבור רכישת מזון מוכן ליולדת ובני ביתה. השובר אישי ואינו ניתן להעברה.',
    W - MX, y, W - MX * 2, 10, SUB, 3)
  y -= 6

  // ברכה וחתימה — לא יורד מתחת לשולי המסגרת (מינימום y=52)
  const blessY = Math.max(y, 52)
  centerText(c, 'בברכת מזל טוב ורוב נחת', W / 2, blessY, 12, NAVY)
  centerText(c, 'אגף עזר ליולדות · היכל החתם סופר', W / 2, blessY - 16, 10.5, SUB)

  return Buffer.from(await doc.save()).toString('base64')
}

async function renderRecovery(input: VoucherInput): Promise<string> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  const logoBytes = loadLogo()
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null
  const page = doc.addPage([W, H])
  const c: Ctx = { page, font, logo }

  let y = drawHeader(c, 'אגף עזר ליולדות')

  drawIssueDate(c, y)
  serialLine(c, input.serial, y)
  y -= 24

  centerText(c, 'שובר הבראה ליולדת', W / 2, y, 24, NAVY)
  y -= 12
  goldDivider(c, W / 2, y); y -= 26

  rightText(c, `לכבוד משפחת ${input.motherName} הנכבדה`, W - MX, y, 13, INK); y -= 22
  centerText(c, 'מזל טוב לרגל השמחה!', W / 2, y, 13, GOLD); y -= 26

  y = paragraph(c,
    'שובר זה מאשר את זכאותכם לשהות הבראה בבית ההחלמה לאחר הלידה. נא להציג שובר זה בעת ההגעה לבית ההחלמה לצורך השלמת הרישום ותיאום הפרטים.',
    W - MX, y, W - MX * 2, 12.5, SUB, 6)
  y -= 12

  y = detailsBox(c, 'פרטי היולדת והשהייה', y, [
    ['שם היולדת', input.motherName],
    ['תעודת זהות', input.motherId || '—'],
    ['תאריך הלידה', fmtDate(input.birthDate)],
    ['בית החלמה', input.recoveryHome || 'ייקבע מול המזכירות'],
    ['ימי זכאות בבית ההחלמה', input.recoveryDays != null ? `${input.recoveryDays} ימים` : '—'],
    ['טלפון', input.phone || '—'],
  ])

  y -= 4
  y = paragraph(c,
    'לתשומת לבכם: יש לתאם מראש את מועד ההגעה מול בית ההחלמה. השובר אישי ואינו ניתן להעברה. לבירורים ניתן לפנות למזכירות היכל החתם סופר.',
    W - MX, y, W - MX * 2, 10.5, SUB, 4)
  y -= 12

  centerText(c, 'בברכת מזל טוב ורוב נחת', W / 2, y, 12, NAVY); y -= 18
  centerText(c, 'אגף עזר ליולדות · היכל החתם סופר', W / 2, y, 11, SUB)

  return Buffer.from(await doc.save()).toString('base64')
}

export type { VoucherInput }

export async function buildMaternityVouchers(
  input: VoucherInput,
  opts: { includeCard?: boolean } = {},
): Promise<MailAttachment[]> {
  const includeCard = opts.includeCard !== false // ברירת מחדל: כולל את שובר הכרטיס
  const recovery = await renderRecovery(input)
  const out: MailAttachment[] = [
    { filename: 'שובר-הבראה-ליולדת.pdf', mimeType: 'application/pdf', contentB64: recovery },
  ]
  if (includeCard) {
    const card = await renderFoodCard(input)
    out.push({ filename: 'שובר-כרטיס-מזון.pdf', mimeType: 'application/pdf', contentB64: card })
  }
  return out
}

// בונה רק את שובר הכרטיס (לשליחה כשהמלאי מתחדש)
export async function buildCardVoucherOnly(input: VoucherInput): Promise<MailAttachment[]> {
  const card = await renderFoodCard(input)
  return [{ filename: 'שובר-כרטיס-מזון.pdf', mimeType: 'application/pdf', contentB64: card }]
}

// בונה רק את שובר ההבראה (לשליחה מחדש כשמעדכנים את ימי הזכאות)
export async function buildRecoveryVoucherOnly(input: VoucherInput): Promise<MailAttachment[]> {
  const recovery = await renderRecovery(input)
  return [{ filename: 'שובר-הבראה-ליולדת.pdf', mimeType: 'application/pdf', contentB64: recovery }]
}
