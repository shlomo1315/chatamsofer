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
  hebrewDate, loadLogo, logoBox, rightText, centerText, centerParagraph,
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
// ⚠️ "מה צריך להביא" הוסר: כל תוכנו כבר מופיע במקומות אחרים בשובר
// (חובה להדפיס · המוקד הרשום · הוראות ההפעלה), ותעודת זהות אינה נדרשת.
export const HOLIDAY_SECTION_TITLES = {
  center: 'מוקד האיסוף שלכם',
  amount: 'הסכום שנטען',
  activation: 'הפעלת הכרטיס — חובה לפני השימוש',
  unique: 'שובר אישי — תקף למוקד הרשום בלבד',
}

/**
 * 🔴 שתי ההדגשות שבלעדיהן המשפחה מגיעה בלי שובר או ביום הלא נכון.
 * מוצגות בתיבות בולטות ולא כשורה בין ההוראות — הן נבלעו שם.
 */
export const HOLIDAY_ALERTS = {
  mustPrint:
    'חובה להדפיס שובר זה ולהציגו במוקד איסוף הכרטיס. ' +
    'ללא השובר לא תוכלו לאסוף את הכרטיס!',
  timesStrict: [
    'בשום אופן אין לבוא בימים ושעות אחרות!',
    'הדבר פוגע במשפחות המוקדים שפתחו את ביתם וליבם עבורכם בהתנדבות.',
    'בסיום ימי החלוקה יבוטלו הכרטיסים שלא נאספו,',
    'ולא תהיה שום אפשרות לאוספם לאחר מכן!',
  ],
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

  // הלוגו בצד — הכותרת הענקית היא הפריט הראשי בראש הדף.
  // ⚠️ logoBox ולא ריבוע: הלוגו רחב מגובהו, וציור ב-dim×dim מתח אותו.
  if (c.logo) {
    const box = logoBox(c.logo, 58)
    c.page.drawImage(c.logo, { x: W - 40 - box.width, y: bandY + (bandH - box.height) / 2, ...box })
  }

  // 🔴 הכותרת הענקית — מהות השובר, לא שם הארגון. 46pt מול 26pt בלידה.
  // ⚠️ ממורכזת על **רוחב העמוד המלא** ולא על שארית הרוחב: הקיזוז הקודם
  // הזיז אותה שמאלה והיא נראתה מוסטת. הלוגו יושב בפינה ואינו דוחק אותה.
  centerText(c, HOLIDAY_HEADLINE, W / 2, bandY + 24, 46, rgb(1, 1, 1))
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

/**
 * 🔴 כרטיס המוקד — הפרט שבגללו השובר קיים.
 * מודגש הרבה מעבר לתיבה רגילה: מסגרת עבה, שם המוקד גדול, ושאר הפרטים
 * מתחתיו. במוקד עמוס זה מה שצריך להיקרא ממטר.
 */
function centerCard(
  c: Ctx, y: number,
  label: string, address?: string | null, hours?: string | null, phone?: string | null,
): number {
  const x = MX
  const w = W - MX * 2
  const titleH = 28
  const nameH = 27
  const detail = [
    address ? `כתובת: ${address}` : null,
    hours ? `ימים ושעות: ${hours}` : null,
    phone ? `טלפון: ${phone}` : null,
  ].filter(Boolean) as string[]
  const lineH = 16
  const boxH = titleH + nameH + detail.length * lineH + 12

  // מסגרת עבה (2.5 מול 1.2 בתיבה רגילה) — נבדלת גם בשחור-לבן.
  c.page.drawRectangle({
    x, y: y - boxH, width: w, height: boxH,
    color: rgb(1, 1, 1), borderColor: EMERALD, borderWidth: 2.5,
  })
  c.page.drawRectangle({ x, y: y - titleH, width: w, height: titleH, color: EMERALD })
  rightText(c, HOLIDAY_SECTION_TITLES.center, x + w - 14, y - titleH + 10, 13, rgb(1, 1, 1))

  // שם המוקד — הגדול ביותר בגוף השובר.
  centerText(c, label, W / 2, y - titleH - 24, 17, EMERALD)

  let cy = y - titleH - nameH - 18
  for (const line of detail) {
    rightText(c, line, x + w - 16, cy, 11.5, INK)
    cy -= lineH
  }
  return y - boxH - 12
}

/**
 * תיבת אזהרה בולטת — רקע מלא וטקסט לבן, כדי שתיקרא ראשונה.
 * ⚠️ רקע מלא ולא מסגרת: מסגרת נבלעת בין שאר התיבות בשובר.
 */
function alertBox(c: Ctx, y: number, lines: string[], size = 11.5, bold = false): number {
  const x = MX
  const w = W - MX * 2
  const lineH = size + 5
  const boxH = lines.length * lineH + 18

  c.page.drawRectangle({ x, y: y - boxH, width: w, height: boxH, color: EMERALD })
  // פס נחושת בקצה — מוסיף היכר גם כשהרקע מודפס אפור.
  c.page.drawRectangle({ x, y: y - boxH, width: w, height: 3, color: COPPER })

  let cy = y - 20
  for (const line of lines) {
    centerText(c, line, W / 2, cy, size, rgb(1, 1, 1))
    // 🔴 הדגשה בציור כפול בהיסט זעיר.
    //
    // ⚠️ Heebo מוטמע במשקל אחד בלבד — אין לו variant בולד. ציור השורה
    // פעם שנייה בהיסט של 0.3pt מעבה את הקו ומשיג את אותו אפקט, בלי
    // להטמיע פונט שני שהיה מוסיף ~120KB לכל שובר.
    if (bold) {
      centerText(c, line, W / 2 + 0.3, cy, size, rgb(1, 1, 1))
      centerText(c, line, W / 2, cy + 0.3, size, rgb(1, 1, 1))
    }
    cy -= lineH
  }
  return y - boxH - 14
}

/** תיבה עם כותרת צבועה. */
function titledBox(c: Ctx, x: number, y: number, w: number, title: string, lines: string[]): number {
  const titleH = 24
  const lineH = 16.5
  const boxH = titleH + lines.length * lineH + 12

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
  centerText(c, data.familyName, W / 2, y, 19, EMERALD)
  y -= 26

  y = centerParagraph(c, data.texts.intro, W / 2, y, W - MX * 2 - 20, 11, SUB)
  y -= 12

  // 🔴 המוקד — הפרט המרכזי בשובר, בכרטיס מודגש.
  y = centerCard(c, y, data.centerLabel, data.centerAddress, data.centerHours, data.centerPhone)

  // 🔴 מיד אחרי המוקד: ההגעה מחוץ לימים ולשעות פוגעת במשפחות המתנדבות,
  // וכרטיס שלא נאסף מבוטל ללא אפשרות שחזור.
  //
  // ⚠️ צמוד לשעות ולא בתחתית הדף: הקורא רואה מתי לבוא ומיד אחר כך מה
  // קורה אם יבוא בזמן אחר. בתחתית הדף ההדגשה התנתקה מהשעות שהיא מסייגת.
  y = alertBox(c, y, HOLIDAY_ALERTS.timesStrict, 11, true)

  // 🔴 חובה להדפיס — בלי זה המשפחה מגיעה בידיים ריקות.
  y = alertBox(c, y, [HOLIDAY_ALERTS.mustPrint], 11)

  // ── הסכום שנטען ──
  // ⚠️ שורה נמוכה (32) ולא תיבה בגובה 46: שתי תיבות האזהרה החדשות דחפו
  // את התוכן מתחת לתחתית הדף, וזה בדיוק המקום שבו החזרתיות עלתה בגובה.
  if (data.amount != null) {
    const amtH = 32
    c.page.drawRectangle({
      x: MX, y: y - amtH, width: W - MX * 2, height: amtH,
      color: COPPER_SOFT, borderColor: COPPER, borderWidth: 1.2,
    })
    centerText(c, `${HOLIDAY_SECTION_TITLES.amount}: ${data.amount.toLocaleString('he-IL')} ₪`,
      W / 2, y - 21, 13, EMERALD)
    y -= amtH + 10
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
    const titleH = 20
    const lineH = 13
    const boxH = titleH + (lines.length + (uniq.length ? 1 : 0)) * lineH + 10

    c.page.drawRectangle({
      x: MX, y: y - boxH, width: W - MX * 2, height: boxH,
      color: EMERALD_SOFT, borderColor: EMERALD, borderWidth: 1.2,
    })
    c.page.drawRectangle({ x: MX, y: y - titleH, width: W - MX * 2, height: titleH, color: EMERALD })
    rightText(c, HOLIDAY_SECTION_TITLES.activation, W - MX - 14, y - titleH + 7, 11, rgb(1, 1, 1))

    let ay = y - titleH - 13
    for (const ln of lines) { rightText(c, ln, W - MX - 14, ay, 9.5, INK); ay -= lineH }
    if (uniq.length) {
      const joined = [...uniq].reverse().join('     ')
      const pw = c.font.widthOfTextAtSize(joined, 11)
      c.page.drawText(joined, { x: W / 2 - pw / 2, y: ay, size: 11, font: c.font, color: EMERALD })
    }
    y -= boxH + 10
  }

  // ⚠️ תיבת "שובר אישי" הוסרה: היא חזרה על מה שההוראות ואזהרת הימים
  // כבר אומרות, והגובה שלה נדרש לתיבות האזהרה החדשות. הנוסח נשמר
  // ב-HOLIDAY_SECTION_TITLES.unique למקרה שיוחזר.

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

/**
 * תווית החלוקה לשובר: "חלוקת תשרי תשפ״ז".
 *
 * ⚠️ בטבלה name="תשרי" ו-year="תשפ״ז" בשדות נפרדים, ורק צירופם קריא
 * למשפחה. בלי המילה "חלוקת" השורה נקראת כשם חג ולא כשם החלוקה.
 */
export function holidayDistributionLabel(
  name?: string | null,
  year?: string | null,
): string | null {
  const n = (name ?? '').trim()
  if (!n) return null
  const y = (year ?? '').trim()
  const base = n.startsWith('חלוקת') ? n : `חלוקת ${n}`
  return y ? `${base} ${y}` : base
}
