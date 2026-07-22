// שוברי PDF מעוצבים ליולדת — שובר כרטיס מזון ושובר הבראה (בית החלמה).
// פונט Heebo מוטמע. הטקסט נכתב בסדר לוגי (מנוע ה-PDF מיישם RTL בעצמו).
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'fs'
import { join } from 'path'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import { wrapText } from './rtlText'
import { toVisual } from './pdfBidi'
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
  const r = n % 100
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

// עיבוד bidi אמיתי (bidi-js): ממיר טקסט לוגי → visual — מספרים/שעות/מייל LTR מבודדים
// נכון, סוגריים ממוראים, וכל השאר RTL. שם ההיסטורי isoNum נשמר לתאימות עם קוראים קיימים.
export function isoNum(s: string): string {
  return toVisual(String(s ?? ''))
}
// מדידת רוחב (על הטקסט ה-visual, עקבי עם הציור)
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
// פסקה עטופה, יישור לימין; מחזיר את ה-y שאחרי הפסקה.
// העטיפה נעשית על הטקסט הלוגי (לפי מילים); ההמרה ל-visual קורית בתוך rightText לכל שורה.
export function paragraph(c: Ctx, text: string, xRight: number, y: number, maxWidth: number, size: number, color: RGB, lineGap = 6): number {
  const lines = wrapText(text, maxWidth, s => c.font.widthOfTextAtSize(toVisual(s), size))
  for (const ln of lines) { rightText(c, ln, xRight, y, size, color); y -= size + lineGap }
  return y
}
// טקסט מודגש (faux-bold) — אין פונט bold נפרד, לכן מציירים פעמיים בהיסט זעיר.
export function boldRightText(c: Ctx, text: string, xRight: number, y: number, size: number, color: RGB) {
  const t = toVisual(text)
  const w = c.font.widthOfTextAtSize(t, size)
  c.page.drawText(t, { x: xRight - w, y, size, font: c.font, color })
  c.page.drawText(t, { x: xRight - w + 0.35, y, size, font: c.font, color }) // היסט → אפקט הדגשה
}

// פסקה שבה החלק שלפני ":" הראשון מודגש (כותרת), והשאר רגיל. מיישר לימין, עם עטיפה.
// למשל: "אישור: בקשתכם אושרה" → "אישור:" מודגש.
export function paragraphWithBoldPrefix(
  c: Ctx, text: string, xRight: number, y: number, maxWidth: number, size: number,
  titleColor: RGB, bodyColor: RGB, lineGap = 6,
): number {
  const ci = text.indexOf(':')
  // אין ":" → פסקה רגילה
  if (ci < 0) return paragraph(c, text, xRight, y, maxWidth, size, bodyColor, lineGap)
  const title = text.slice(0, ci + 1)          // כולל הנקודתיים
  const rest = text.slice(ci + 1).trim()
  // הכותרת נכתבת בשורה הראשונה מימין; המשך הטקסט זורם אחריה (עטיפה פשוטה: כותרת בשורה, גוף בהמשך)
  const titleVisual = toVisual(title)
  const titleW = c.font.widthOfTextAtSize(titleVisual, size)
  boldRightText(c, title, xRight, y, size, titleColor)
  // גוף — בשורה שאחרי הכותרת אם צר, אחרת ממשיך משמאל לכותרת
  const bodyRightStart = xRight - titleW - 6
  const bodyMax = maxWidth - titleW - 6
  const lines = wrapText(rest, bodyMax, s => c.font.widthOfTextAtSize(toVisual(s), size))
  if (lines.length) {
    rightText(c, lines[0], bodyRightStart, y, size, bodyColor)
    y -= size + lineGap
    for (let i = 1; i < lines.length; i++) { rightText(c, lines[i], xRight, y, size, bodyColor); y -= size + lineGap }
  } else {
    y -= size + lineGap
  }
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
    // label+value כמחרוזת אחת — ההקשר העברי של ה-label מבטיח שמספרים (ת"ז/טלפון/תאריך)
    // יוצגו נכון (toVisual מהפך, ו-pdf-lib מהפך בחזרה בהקשר RTL).
    rightText(c, `${label}: ${value || '—'}`, valRight, ry, 12, NAVY)
    ry -= rowH
  }
  return y - boxH - 16
}

// תיבת מוקדים — לכל מוקד: שם, כתובת, ימים ושעות
type Center = { name: string; city?: string | null; address?: string | null; pickup_days?: string | null; pickup_hours?: string | null }
function centersBox(c: Ctx, title: string, y: number, centers: Center[]): number {
  const x = MX, w = W - MX * 2
  const titleH = 22
  const items = centers.filter(cn => cn.name)
  // ⚠️ כל מוקד תופס שתי שורות: שם ב-ry ופרטים ב-ry-12.5 (פונט 9).
  // ב-perH=20 השורה השנייה נגעה בשם של המוקד הבא; 24 משאיר מרווח נקי
  // ובו-זמנית חוסך 12 נק' על 6 מוקדים — מקום שנדרש לחתימה בתחתית.
  const perH = 24
  const contentH = items.length ? items.length * perH : 22
  const boxH = titleH + contentH + 6
  roundedBox(c, x, y - boxH, w, boxH, GOLD, rgb(1, 1, 1))
  c.page.drawRectangle({ x, y: y - titleH, width: w, height: titleH, color: NAVY })
  rightText(c, title, x + w - 14, y - titleH + 6, 12, rgb(1, 1, 1))

  let ry = y - titleH - 14
  if (!items.length) {
    rightText(c, 'רשימת המוקדים תימסר לכם על ידי המזכירות', x + w - 16, ry, 11, SUB)
  } else {
    for (const cn of items) {
      // שורה 1: נקודת זהב + שם המוקד
      c.page.drawSvgPath('M 0 -2.2 L 2.2 0 L 0 2.2 L -2.2 0 Z', { x: x + w - 9, y: ry + 4, color: GOLD, borderWidth: 0 })
      rightText(c, cn.name, x + w - 18, ry, 11, NAVY)
      // שורה 2: כתובת · ימים · שעות — כמחרוזת אחת (toVisual מטפל בהיפוך טווח השעות).
      // ⚠️ רווח ולא פסיק: הפסיק מוסר ב-toVisual (הוא שובר את סדר ה-bidi),
      // ולכן הופיע במקום שגוי אחרי שם הרחוב.
      const addr = [cn.address, cn.city].filter(Boolean).join(' ')
      const line2 = [addr, cn.pickup_days, (cn.pickup_hours || '').trim()].filter(Boolean).join('  ·  ')
      if (line2) rightText(c, line2, x + w - 18, ry - 12.5, 9, SUB)
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
  /** לידה שקטה — ⚠️ בלי ברכות "מזל טוב"/"לרגל השמחה" בשום מקום בשובר. */
  silent?: boolean
}

// שורת מספר סידורי לשובר (פינה שמאלית עליונה).
// התווית (עברית) והמספר מצוירים בנפרד — המספר עומד בפני עצמו ולכן מוצג תקין (DDMMYYYY.XXXX),
// ולא הפוך כפי שקרה כשהוא היה משובץ בתוך מחרוזת עברית.
function serialLine(c: Ctx, serial: string | null | undefined, y: number) {
  if (!serial) return
  // מחרוזת אחת — toVisual מטפל בהיפוך המספר; ציור מפוצל היה גורם להיפוך כפול.
  rightText(c, `מס׳ שובר: ${serial}`, MX + 150, y, 9, SUB)
}

// שורת "הונפק בתאריך" — מחרוזת אחת (toVisual מטפל בתאריך הלועזי).
export function drawIssueDate(c: Ctx, y: number) {
  const { prefix, greg } = issueDateParts()
  rightText(c, `${prefix}${greg}`, W - MX, y, 10, SUB)
}

async function renderFoodCard(input: VoucherInput): Promise<string> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  const logoBytes = loadLogo()
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null
  const page = doc.addPage([W, H])
  const c: Ctx = { page, font, logo }

  // ⚠️ בלידה שקטה לא מופיעה המילה "יולדות/יולדת" בשום מקום בשובר.
  let y = drawHeader(c, input.silent ? 'היכל החתם סופר' : 'אגף עזר ליולדות')

  // תאריך + מספר סידורי
  drawIssueDate(c, y)
  serialLine(c, input.serial, y)
  y -= 22

  // כותרת ראשית
  centerText(c, 'שובר לקבלת כרטיס לרכישת אוכל מוכן', W / 2, y, 19, NAVY)
  y -= 10
  goldDivider(c, W / 2, y); y -= 18

  // לכבוד
  rightText(c, `לכבוד משפחת ${input.motherName} הנכבדה`, W - MX, y, 12, INK); y -= 18

  // פסקת פתיחה (ללא סכום בתוך המשפט — הסכום מוצג כשדה נפרד כדי שיוצג תקין)
  y = paragraph(c,
    input.silent
      ? 'הנהלת "היכל החתם סופר" אישרה את בקשתכם לקבלת כרטיס לרכישת מזון מוכן, כמפורט להלן.'
      : 'הננו שמחים לבשר לכם כי הנהלת "היכל החתם סופר" — אגף עזר ליולדות, אישרה את בקשתכם לקבלת כרטיס מזון טעון לרכישת מזון מוכן ליולדת, כמפורט להלן.',
    W - MX, y, W - MX * 2, 11, SUB, 4)
  y -= 3

  // סכום הכרטיס — תיבת הדגשה. מחרוזת אחת (toVisual מטפל בהיפוך "600").
  const amH = 28
  c.page.drawRectangle({ x: MX, y: y - amH, width: W - MX * 2, height: amH, color: GOLD_SOFT, borderColor: GOLD, borderWidth: 1 })
  rightText(c, 'סכום טעינת הכרטיס: 600 ש"ח', W - MX - 14, y - 19, 14, NAVY)
  y = y - amH - 8

  // אזהרה אדומה
  const warnH = 34
  c.page.drawRectangle({ x: MX, y: y - warnH, width: W - MX * 2, height: warnH, color: rgb(0.996, 0.953, 0.953), borderColor: RED, borderWidth: 1 })
  let wy = y - 13
  wy = paragraph(c, 'חובה להדפיס שובר זה ולהביאו למוקד החלוקה לצורך קבלת הכרטיס — לא נוכל להעניק כרטיס בלי אישור זה!', W - MX - 12, wy, W - MX * 2 - 24, 11, RED, 3)
  y = y - warnH - 8

  // פרטי היולדת
  y = detailsBox(c, input.silent ? 'פרטי המבקשת' : 'פרטי היולדת', y, [
    [input.silent ? 'שם המבקשת' : 'שם היולדת', input.motherName],
    ['תעודת זהות', input.motherId || '—'],
    ['כתובת', input.address || '—'],
    ['עיר', input.city || '—'],
    ['טלפון', input.phone || '—'],
    ['תאריך לידת התינוק', fmtDate(input.birthDate)],
  ])

  // מוקדי האיסוף — שם, כתובת, ימים ושעות. ניתן לגשת לכל אחד מהם.
  y = centersBox(c, 'מוקדי איסוף הכרטיס', y, input.centers ?? [])
  // ⚠️ פונט וריווח מוקטנים — הבלוק שמתחת ירד נמוך מדי והחתימה נחתכה
  // בקצה העמוד. הקיצור כאן מעלה את כל התחתית פנימה.
  y = paragraph(c, 'תוכלו לבחור בכל מוקד לקבלת הכרטיס.', W - MX, y, W - MX * 2, 10, NAVY, 2)
  y += 2

  // ── הפעלת הכרטיס — תיבת הדגשה (חובה לפני השימוש) ──
  {
    const innerRight = W - MX - 14
    const innerW = W - MX * 2 - 28
    const FS = 10           // פונט מוקטן — כדי שכל הבלוק ייכנס בתוך המסגרת
    const measure = (s: string) => c.font.widthOfTextAtSize(s, FS)
    // מספרי הטלפון המעודכנים של היולדת/בעלה — רק מהם ניתן להפעיל את הכרטיס
    const phones = [input.phone, input.spousePhone].map(p => String(p ?? '').trim()).filter(Boolean)
    const uniqPhones = [...new Set(phones)]

    // טקסטים מקוצרים — כדי שהבלוק לא יגלוש מהמסגרת
    const lineA = 'לאחר קבלת הכרטיס, חובה להפעילו בהתקשרות למוקד:'
    const lineMoked = 'להפעלה חייגו: 02-3131325 שלוחה 1'
    const lineB = uniqPhones.length
      ? 'הזיהוי אוטומטי לפי הטלפון שבמערכת — ההפעלה רק מהמספרים:'
      : 'הזיהוי אוטומטי לפי הטלפון שבמערכת — ההפעלה רק ממספרים אלו.'
    const wA = wrapText(lineA, innerW, measure)
    const wB = wrapText(lineB, innerW, measure)
    const titleH = 20
    const lineH = 13.5
    // ⚠️ ריפוד תחתון 20 (ולא 12): שורת המספרים נגעה בגבול המסגרת ונראתה
    // כאילו היא חופפת לטקסט שמתחתיה.
    const boxH = titleH + (wA.length + 1 /*שורת המוקד*/ + wB.length + (uniqPhones.length ? 1 : 0)) * lineH + 20

    c.page.drawRectangle({ x: MX, y: y - boxH, width: W - MX * 2, height: boxH, color: GOLD_SOFT, borderColor: GOLD, borderWidth: 1.2 })
    c.page.drawRectangle({ x: MX, y: y - titleH, width: W - MX * 2, height: titleH, color: NAVY })
    c.page.drawRectangle({ x: MX, y: y - titleH, width: W - MX * 2, height: 3, color: GOLD })
    rightText(c, 'הפעלת הכרטיס — חובה לפני השימוש!', innerRight, y - titleH + 6, 11, rgb(1, 1, 1))

    let ay = y - titleH - 12
    for (const ln of wA) { rightText(c, ln, innerRight, ay, FS, INK); ay -= lineH }
    rightText(c, lineMoked, innerRight, ay, FS, NAVY); ay -= lineH
    for (const ln of wB) { rightText(c, ln, innerRight, ay, FS, RED); ay -= lineH }
    if (uniqPhones.length) {
      // ⚠️ המספרים מצוירים לבדם, ולכן אסור להעביר אותם דרך toVisual:
      // toVisual הופך ספרות בכוונה (הרנדרר מצייר LTR-בתוך-עברית הפוך),
      // אך כאן אין הקשר עברי — וההיפוך הציג "5131017250" במקום המספר.
      // drawText ישירות שומר על הספרות כפי שהן.
      const phonesLine = [...uniqPhones].reverse().join('     ')
      const pw = c.font.widthOfTextAtSize(phonesLine, FS + 1)
      c.page.drawText(phonesLine, { x: W / 2 - pw / 2, y: ay, size: FS + 1, font: c.font, color: NAVY })
      ay -= lineH
    }

    y = y - boxH - 14
  }

  // הערות בתחתית
  y = paragraph(c,
    input.silent
      ? 'הכרטיס בתוקף עד 6 שבועות, ורק לרכישת מזון מוכן למשפחה. השובר אישי ואינו ניתן להעברה.'
      : 'הכרטיס בתוקף עד 6 שבועות מהלידה, ורק לרכישת מזון מוכן ליולדת ובני ביתה. השובר אישי ואינו ניתן להעברה.',
    W - MX, y, W - MX * 2, 9.5, SUB, 2)
  y -= 8

  // ⚠️ ברכה וחתימה — יורדות תמיד מתחת לתוכן. קודם היה Math.max(y, 46),
  // שדחף אותן *בחזרה למעלה* כשהמקום נגמר — היישר לתוך בלוק ההפעלה,
  // וכל השורות התחתונות נראו חופפות. הרצפה 30 היא רק הגנה מפני גלישה
  // מחוץ לעמוד, ונמוכה מספיק כדי שלא תיצור חפיפה בפריסה המלאה.
  const blessY = Math.max(y, 30)
  centerText(c, input.silent ? 'בברכה' : 'בברכת מזל טוב ורוב נחת', W / 2, blessY, 11, NAVY)
  centerText(c, input.silent ? 'היכל החתם סופר' : 'אגף עזר ליולדות · היכל החתם סופר', W / 2, blessY - 14, 10, SUB)

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

  // ⚠️ בלידה שקטה לא מופיעה המילה "יולדות/יולדת" בשום מקום בשובר.
  let y = drawHeader(c, input.silent ? 'היכל החתם סופר' : 'אגף עזר ליולדות')

  drawIssueDate(c, y)
  serialLine(c, input.serial, y)
  y -= 24

  centerText(c, input.silent ? 'שובר הבראה' : 'שובר הבראה ליולדת', W / 2, y, 24, NAVY)
  y -= 12
  goldDivider(c, W / 2, y); y -= 26

  rightText(c, `לכבוד משפחת ${input.motherName} הנכבדה`, W - MX, y, 13, INK); y -= 22
  // ⚠️ בלידה שקטה אין ברכות — לא "מזל טוב" ולא "לרגל השמחה".
  if (!input.silent) { centerText(c, 'מזל טוב לרגל השמחה!', W / 2, y, 13, GOLD); y -= 26 }
  else y -= 6

  y = paragraph(c,
    input.silent
      ? 'שובר זה מאשר את זכאותכם לשהות הבראה בבית ההחלמה. נא להציג שובר זה בעת ההגעה לבית ההחלמה לצורך השלמת הרישום ותיאום הפרטים.'
      : 'שובר זה מאשר את זכאותכם לשהות הבראה בבית ההחלמה לאחר הלידה. נא להציג שובר זה בעת ההגעה לבית ההחלמה לצורך השלמת הרישום ותיאום הפרטים.',
    W - MX, y, W - MX * 2, 12.5, SUB, 6)
  y -= 12

  y = detailsBox(c, input.silent ? 'פרטי המבקשת והשהייה' : 'פרטי היולדת והשהייה', y, [
    [input.silent ? 'שם המבקשת' : 'שם היולדת', input.motherName],
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

  centerText(c, input.silent ? 'בברכה' : 'בברכת מזל טוב ורוב נחת', W / 2, y, 12, NAVY); y -= 18
  centerText(c, input.silent ? 'היכל החתם סופר' : 'אגף עזר ליולדות · היכל החתם סופר', W / 2, y, 11, SUB)

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
