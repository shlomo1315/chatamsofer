// ─────────────────────────────────────────────────────────────────────────────
// שובר חלוקת החגים.
//
// 🔴 ההבדל משובר הלידה אינו יכול להיות צבע בלבד.
// קודם נבדלו השניים רק בפלטה (כחול-זהב מול ירוק-נחושת), אבל רוב
// המשפחות מדפיסות בבית בשחור-לבן — ושם שתי הפלטות קורסות לאותו אפור.
// המבנה היה זהה פיקסל-בפיקסל: אותה מסגרת, אותו פס בגובה 92, אותה
// כותרת "היכל החתם סופר" בגודל 26. בהדפסה אי אפשר היה להבדיל ביניהם.
//
// ההבחנה היום מבנית וטקסטואלית, ועובדת גם בלי צבע:
//   · כותרת ענקית "חלוקת חגים" (46pt) על פס שחור מלא — במקום שם הארגון
//   · מסגרת חיצונית מקווקוות במקום רציפה — נבדלת גם במבט חטוף
//   · פס נמוך יותר (68 מול 92) — פרופורציה שונה של ראש הדף
//   · כותרות סעיפים בנוסח ייחודי ("היכן מקבלים את חבילת החג")
// הצבע נשאר כתוספת למי שמדפיס בצבע, לא כנשא ההבחנה.
//
// ⚠️ מנוע הציור משותף (lib/maternityVoucher): אותן פונקציות טקסט ופסקה.
// שכפול המנוע היה מייצר שני מנועים שמתפצלים בכל תיקון.
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

// ── ההבחנה שאינה תלויה בצבע ──

/**
 * 🔴 הכותרת הראשית. שובר הלידה פותח ב"היכל החתם סופר"; כאן הכותרת היא
 * מהות השובר עצמו, בגופן ענק. זה מה שקורא רואה ראשון גם בצילום שחור-לבן.
 */
export const HOLIDAY_HEADLINE = 'חלוקת חגים'

/** מסגרת מקווקוות — שובר הלידה רציף. הבדל שניכר בלי צבע. */
export const HOLIDAY_FRAME_STYLE = 'dashed' as const

/**
 * כותרות הסעיפים. ⚠️ "מוקד החלוקה שלכם" הופיע גם בשובר הלידה —
 * נוסח זהה בשני מסמכים מבטל את ההבחנה הטקסטואלית.
 */
export const HOLIDAY_SECTION_TITLES = {
  center: 'היכן מקבלים את חבילת החג',
  instructions: 'מה צריך להביא',
  amount: 'הסכום שנטען',
  activation: 'הפעלת הכרטיס — חובה לפני השימוש',
  unique: 'שובר אישי — תקף למוקד הרשום בלבד',
}

/**
 * מצייר מלבן מקווקו. pdf-lib אינו תומך ב-dash על drawRectangle, ולכן
 * הקו מורכב ממקטעים קצרים לאורך ארבע הצלעות.
 */
function dashedRect(
  c: Ctx, x: number, y: number, w: number, h: number,
  color: RGB, thickness: number, dash = 7, gap = 5,
) {
  const step = dash + gap
  // אופקיים (תחתון ועליון)
  for (let dx = 0; dx < w; dx += step) {
    const len = Math.min(dash, w - dx)
    c.page.drawLine({ start: { x: x + dx, y }, end: { x: x + dx + len, y }, color, thickness })
    c.page.drawLine({ start: { x: x + dx, y: y + h }, end: { x: x + dx + len, y: y + h }, color, thickness })
  }
  // אנכיים (ימין ושמאל)
  for (let dy = 0; dy < h; dy += step) {
    const len = Math.min(dash, h - dy)
    c.page.drawLine({ start: { x, y: y + dy }, end: { x, y: y + dy + len }, color, thickness })
    c.page.drawLine({ start: { x: x + w, y: y + dy }, end: { x: x + w, y: y + dy + len }, color, thickness })
  }
}

export interface HolidayVoucherData {
  familyName: string
  /** שם החלוקה — מוצג בראש השובר ("חלוקת חגי תשרי תשפ״ז"). */
  distributionName?: string | null
  /** המוקד שנבחר — "ירושלים · אזור נווה צבי". */
  centerLabel: string
  centerAddress?: string | null
  centerHours?: string | null
  centerPhone?: string | null
  /** הסכום שנטען לכרטיס — מוצג בהדגשה. */
  amount?: number | null
  /** ⚠️ רק מהמספרים האלה ניתן להפעיל את הכרטיס — כמו בשובר היולדות. */
  phones?: (string | null | undefined)[]
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

  // 🔴 מסגרת חיצונית **מקווקוות** — שובר הלידה רציף. זהו ההבדל הראשון
  // שנקלט בעין, והוא שורד הדפסה בשחור-לבן.
  dashedRect(c, 18, 18, W - 36, H - 36, COPPER, 2.2)
  c.page.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, borderColor: EMERALD, borderWidth: 0.7 })

  rightText(c, 'בס"ד', W - 36, H - 46, 10, SUB)

  // ⚠️ פס נמוך מזה של הלידה (68 מול 92) — פרופורציית ראש דף שונה,
  // וגם חוסך את הגובה שהכותרת הענקית צורכת.
  const bandH = 68
  const bandY = H - 36 - bandH
  c.page.drawRectangle({ x: 26, y: bandY, width: W - 52, height: bandH, color: EMERALD })

  // הלוגו קטן יותר ובצד — הוא כבר לא הפריט הראשי בראש הדף.
  if (c.logo) {
    const dim = 44
    c.page.drawImage(c.logo, { x: W - 40 - dim, y: bandY + (bandH - dim) / 2, width: dim, height: dim })
  }

  // 🔴 הכותרת הענקית — מהות השובר, לא שם הארגון. 46pt מול 26pt בלידה.
  // ⚠️ ממורכזת על שארית הרוחב (בלי אזור הלוגו), אחרת היא נראית מוסטת.
  const textCx = (W - 52 - (c.logo ? 60 : 0)) / 2 + 26
  centerText(c, HOLIDAY_HEADLINE, textCx, bandY + 24, 46, rgb(1, 1, 1))
  // שם הארגון יורד לשורת משנה קטנה מתחת לפס.
  centerText(c, 'היכל החתם סופר', W / 2, bandY - 18, 12, EMERALD)

  // כותרת המשנה שהמשתמש עורך בהגדרות.
  let y = bandY - 36
  if (subtitle && subtitle !== HOLIDAY_HEADLINE) {
    centerText(c, subtitle, W / 2, y, 12, COPPER)
    y -= 18
  }
  return y - 8
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

/**
 * ⚠️ ה-Y האחרון שנוצל בשובר שנבנה לאחרונה — נחשף לבדיקות בלבד.
 * ראו BOTTOM_LIMIT.
 */
export let lastBottomY = 0

/** הגבול שמתחתיו התוכן חורג מהמסגרת המקווקוות (18) ומהעמוד (0). */
export const BOTTOM_LIMIT = 30

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

  // שם החלוקה — מזהה איזו חלוקה זו, כשיש כמה בשנה.
  if (data.distributionName) {
    centerText(c, data.distributionName, W / 2, y, 12, COPPER)
    y -= 20
  }

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
  y = titledBox(c, MX, y, W - MX * 2, HOLIDAY_SECTION_TITLES.center, centerLines)

  // ⚠️ המספור בתו נקודה-אמצעית ולא "1." — ספרה+נקודה בתחילת שורה עברית
  // נדחפת לקצה השמאלי ברנדרר, והתוצאה היא ".1 יש להדפיס" במקום "1. יש".
  y = titledBox(c, MX, y, W - MX * 2, HOLIDAY_SECTION_TITLES.instructions, data.texts.instructions.map(t => `• ${t}`))

  // ── הסכום שנטען ──
  if (data.amount != null) {
    const amtH = 46
    c.page.drawRectangle({
      x: MX, y: y - amtH, width: W - MX * 2, height: amtH,
      color: COPPER_SOFT, borderColor: COPPER, borderWidth: 1.2,
    })
    centerText(c, `${HOLIDAY_SECTION_TITLES.amount}: ${data.amount.toLocaleString('he-IL')} ₪`,
      W / 2, y - 29, 14, EMERALD)
    y -= amtH + 14
  }

  // ── הפעלת הכרטיס — אותן הוראות כמו בשובר היולדות ──
  //
  // ⚠️ המספרים מצוירים לבדם ב-drawText ולא דרך rightText: ההקשר העברי
  // הופך ספרות, וטלפון היה מוצג הפוך ("5231313-20").
  {
    const lines = [
      'לאחר קבלת הכרטיס, חובה להפעילו בהתקשרות למוקד:',
      'להפעלה חייגו: 02-3131325 שלוחה 1',
      'הזיהוי אוטומטי לפי הטלפון שבמערכת — ההפעלה רק מהמספרים:',
    ]
    const uniq = [...new Set((data.phones ?? []).map(p => String(p ?? '').trim()).filter(Boolean))]
    const titleH = 22
    const lineH = 14
    const boxH = titleH + (lines.length + (uniq.length ? 1 : 0)) * lineH + 14

    c.page.drawRectangle({
      x: MX, y: y - boxH, width: W - MX * 2, height: boxH,
      color: EMERALD_SOFT, borderColor: EMERALD, borderWidth: 1.2,
    })
    c.page.drawRectangle({ x: MX, y: y - titleH, width: W - MX * 2, height: titleH, color: EMERALD })
    rightText(c, HOLIDAY_SECTION_TITLES.activation, W - MX - 14, y - titleH + 7, 11, rgb(1, 1, 1))

    let ay = y - titleH - 14
    for (const ln of lines) { rightText(c, ln, W - MX - 14, ay, 10, INK); ay -= lineH }
    if (uniq.length) {
      const joined = [...uniq].reverse().join('     ')
      const pw = c.font.widthOfTextAtSize(joined, 11)
      c.page.drawText(joined, { x: W / 2 - pw / 2, y: ay, size: 11, font: c.font, color: EMERALD })
    }
    y -= boxH + 14
  }

  // ⚠️ אזהרת הייחודיות בצבע הפלטה ולא באדום: אדום שמור לשגיאות, וכאן
  // מדובר בהנחיה ולא בתקלה.
  const warnH = 34
  c.page.drawRectangle({
    x: MX, y: y - warnH, width: W - MX * 2, height: warnH,
    color: rgb(1, 1, 1), borderColor: COPPER, borderWidth: 1,
  })
  centerText(c, HOLIDAY_SECTION_TITLES.unique, W / 2, y - 22, 11, EMERALD)
  y -= warnH + 16

  centerText(c, data.texts.footer, W / 2, y, 11, SUB)
  y -= 20
  centerText(c, hebrewDate(new Date()), W / 2, y, 9.5, SUB)

  // ⚠️ ה-Y שנותר בתחתית הדף — נמדד בבדיקות כדי לתפוס גלישה מהמסגרת.
  // כותרת גדולה יותר או מוקד עם שם ארוך דוחפים אותו כלפי מטה, ומתחת
  // ל-BOTTOM_LIMIT התוכן חורג מהמסגרת המקווקוות.
  lastBottomY = y

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
