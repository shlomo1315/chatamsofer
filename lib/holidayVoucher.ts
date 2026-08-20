// ─────────────────────────────────────────────────────────────────────────────
// שובר חלוקת החגים.
//
// 🔴 פלטת צבעים **נפרדת** משובר הלידה — דרישה מפורשת. הלידה היא
// כחול-נייבי + זהב; כאן ירוק-אזמרגד עמוק + נחושת חמה. שני השוברים
// מגיעים לאותן משפחות, ובלי הבדל ויזואלי חד אי אפשר לדעת ביד איזה
// שובר מחזיקים — במיוחד במוקד חלוקה עמוס.
//
// ⚠️ מנוע הציור משותף (lib/maternityVoucher): אותן פונקציות טקסט, מסגרת
// ופסקה. רק הצבעים והתוכן שונים. שכפול המנוע היה מייצר שני מנועים
// שמתפצלים בכל תיקון.
// ─────────────────────────────────────────────────────────────────────────────

import { PDFDocument, rgb, type RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import {
  W, H, MX, INK, SUB, type Ctx,
  hebrewDate, loadLogo, rightText, centerText, centerParagraph,
} from './maternityVoucher'

// ── הפלטה של החגים ──
/** ירוק-אזמרגד עמוק. ⚠️ אינו כחול — זה מה שמבדיל משובר הלידה. */
export const EMERALD = rgb(0.055, 0.322, 0.259)
export const EMERALD_SOFT = rgb(0.906, 0.957, 0.937)
/** נחושת חמה במקום הזהב של הלידה. */
export const COPPER = rgb(0.706, 0.443, 0.216)
export const COPPER_SOFT = rgb(0.988, 0.949, 0.910)
/** רקע שמנת חמים, גוון שונה מ-CREAM של הלידה. */
export const PARCHMENT = rgb(0.996, 0.988, 0.976)

export interface HolidayVoucherData {
  familyName: string
  /** המוקד שנבחר — "ירושלים · אזור נווה צבי". */
  centerLabel: string
  centerAddress?: string | null
  centerHours?: string | null
  centerPhone?: string | null
  /** מלל נערך מההגדרות. */
  texts: {
    title: string
    intro: string
    instructions: string[]
    footer: string
  }
}

/** ברירות המחדל — נערכות בהגדרות ואינן קבועות בקוד. */
export const HOLIDAY_VOUCHER_DEFAULTS: HolidayVoucherData['texts'] = {
  title: 'שובר חלוקת חגים',
  intro: 'שובר זה מזכה את המשפחה בקבלת כרטיס התמיכה לחגי תשרי במוקד החלוקה הרשום מטה.',
  instructions: [
    'יש להדפיס את השובר ולהביאו למוקד החלוקה.',
    'לא ניתן לקבל את הכרטיס במוקד אחר.',
    'יש להצטייד בתעודת זהות של הנרשם.',
    'לאחר קבלת הכרטיס — יש לחברו לטלפון לפי ההוראות שיימסרו במוקד.',
  ],
  footer: 'בברכת חג כשר ושמח · איגוד הצאצאים היכל החתם סופר',
}

/**
 * כותרת השובר — מקבילה ל-drawHeader של הלידה, בצבעי החגים.
 *
 * ⚠️ לא נעשה שימוש ב-drawHeader המקורי: הוא מקודד את NAVY/GOLD בתוכו,
 * והוספת פרמטרים לו הייתה משנה את שובר הלידה שכבר בשימוש.
 */
function drawHolidayHeader(c: Ctx, subtitle: string): number {
  c.page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PARCHMENT })
  c.page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: COPPER, borderWidth: 2.5, color: PARCHMENT })
  c.page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: EMERALD, borderWidth: 0.8, color: PARCHMENT })

  rightText(c, 'בס"ד', W - 34, H - 44, 10, SUB)

  const bandH = 92
  const bandY = H - 34 - bandH
  c.page.drawRectangle({ x: 24, y: bandY, width: W - 48, height: bandH, color: EMERALD })
  c.page.drawRectangle({ x: 24, y: bandY, width: W - 48, height: 4, color: COPPER })

  if (c.logo) {
    const dim = 64
    c.page.drawImage(c.logo, { x: W - 34 - dim, y: bandY + (bandH - dim) / 2, width: dim, height: dim })
  }
  centerText(c, 'היכל החתם סופר', W / 2, bandY + bandH - 40, 26, rgb(1, 1, 1))
  centerText(c, subtitle, W / 2, bandY + bandH - 64, 13, COPPER_SOFT)
  return bandY - 28
}

/** תיבה עם כותרת צבועה. */
function titledBox(c: Ctx, x: number, y: number, w: number, title: string, lines: string[]): number {
  const titleH = 26
  const lineH = 18
  const boxH = titleH + lines.length * lineH + 14

  c.page.drawRectangle({ x, y: y - boxH, width: w, height: boxH, color: rgb(1, 1, 1), borderColor: COPPER, borderWidth: 1.2 })
  c.page.drawRectangle({ x, y: y - titleH, width: w, height: titleH, color: EMERALD })
  rightText(c, title, x + w - 14, y - titleH + 8, 13, rgb(1, 1, 1))

  let cy = y - titleH - 16
  for (const line of lines) {
    rightText(c, line, x + w - 14, cy, 11.5, INK)
    cy -= lineH
  }
  return y - boxH - 16
}

/** בונה שובר יחיד. */
export async function buildHolidayVoucher(data: HolidayVoucherData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })

  const page = doc.addPage([W, H])
  const logoBuf = loadLogo()
  const logo = logoBuf ? await doc.embedPng(logoBuf).catch(() => null) : null
  const c: Ctx = { page, font, logo }

  let y = drawHolidayHeader(c, data.texts.title)

  // שם המשפחה — הפרט הראשון שמחפשים במוקד.
  centerText(c, data.familyName, W / 2, y, 20, EMERALD)
  y -= 30

  y = centerParagraph(c, data.texts.intro, W / 2, y, W - MX * 2 - 20, 11.5, SUB)
  y -= 18

  // 🔴 המוקד — הפרט המרכזי בשובר.
  const centerLines = [data.centerLabel]
  if (data.centerAddress) centerLines.push(data.centerAddress)
  if (data.centerHours) centerLines.push(data.centerHours)
  if (data.centerPhone) centerLines.push(`טלפון: ${data.centerPhone}`)
  y = titledBox(c, MX, y, W - MX * 2, 'מוקד החלוקה שלכם', centerLines)

  y = titledBox(c, MX, y, W - MX * 2, 'הוראות', data.texts.instructions.map((t, i) => `${i + 1}. ${t}`))

  // ⚠️ אזהרת הייחודיות בצבע הפלטה ולא באדום: אדום שמור לשגיאות, וכאן
  // מדובר בהנחיה ולא בתקלה.
  const warnH = 40
  c.page.drawRectangle({
    x: MX, y: y - warnH, width: W - MX * 2, height: warnH,
    color: EMERALD_SOFT, borderColor: EMERALD, borderWidth: 1,
  })
  centerText(c, 'השובר אישי ומיועד למוקד הרשום בלבד', W / 2, y - 25, 11.5, EMERALD)
  y -= warnH + 20

  centerText(c, data.texts.footer, W / 2, y, 11, SUB)
  y -= 20
  centerText(c, hebrewDate(new Date()), W / 2, y, 9.5, SUB)

  return doc.save()
}

/** מאחד כמה שוברים לקובץ אחד — לשליחה מרוכזת או להדפסה. */
export async function buildHolidayVouchers(items: HolidayVoucherData[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  for (const item of items) {
    const single = await buildHolidayVoucher(item)
    const src = await PDFDocument.load(single)
    const [page] = await merged.copyPages(src, [0])
    merged.addPage(page)
  }
  return merged.save()
}

/** ⚠️ מיוצא לבדיקות: מוודא שהפלטה אכן שונה משל הלידה. */
export const HOLIDAY_PALETTE: Record<string, RGB> = {
  EMERALD, EMERALD_SOFT, COPPER, COPPER_SOFT, PARCHMENT,
}
