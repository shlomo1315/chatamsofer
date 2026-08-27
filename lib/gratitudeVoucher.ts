// שובר "דברי ברכה" — מכתב הכרת הטוב לנדיב.
// אותו עיצוב בדיוק כמו שוברי היולדות (מייבא את העוזרים מ-maternityVoucher),
// בשני מצבים:
//   • blank  — שורות ריקות מקווקוות לכתיבה ביד (מצורף למייל הבקשה)
//   • filled — הטקסט שהיולדת כתבה מודפס על אותן שורות
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import { wrapText } from './rtlText'
import {
  W, H, MX, NAVY, SUB, INK,
  type Ctx, loadLogo, drawHeader, centerText, rightText, goldDivider,
} from './maternityVoucher'
import type { MailAttachment } from './sendMail'

export interface GratitudeVoucherInput {
  mode: 'blank' | 'filled'
  body?: string           // הטקסט שהיולדת כתבה (רק ב-filled)
  // החתימה נקבעת אוטומטית מפרטי המשפחה. אם אלה חסרים (מכתב שלא
  // שויך למוטב, למשל) — נופלים ל-signature: חתימה שנשמרה ידנית על המכתב.
  familyName?: string     // שם משפחה
  husbandName?: string    // שם הבעל
  wifeName?: string       // שם האשה
  city?: string           // עיר מגורים
  /** חתימה שנשמרה ידנית על המכתב — משמשת כנפילה כשאין פרטי משפחה מקושרים למכתב. */
  signature?: string | null
  husbandId?: string      // ת"ז הבעל — מודפס מתחת לחתימה
  wifeId?: string         // ת"ז האשה — מודפס מתחת לחתימה
  street?: string         // רחוב — מודפס עם העיר מתחת לחתימה
  recoveryDays?: number   // ימי הבראה שקיבלה — מודפס למעלה
  recoveryHome?: string   // שם בית ההחלמה — מודפס למעלה
  letterDate?: string     // תאריך כתיבת המכתב (ISO) — מודפס למעלה
  stayDatesHe?: string    // טווח שהייה בבית ההחלמה בתאריך עברי (מוכן מראש) — מודפס למעלה
}

/**
 * בונה את שורת החתימה מפרטי המשפחה:
 * "משפחת הרב שלמה ומרת גיטי ויסברג - עמנואל"
 */
function buildSignature(i: GratitudeVoucherInput): string {
  const family = (i.familyName ?? '').trim()
  const husband = (i.husbandName ?? '').trim()
  const wife = (i.wifeName ?? '').trim()
  const city = (i.city ?? '').trim()

  const names: string[] = []
  if (husband) names.push(`הרב ${husband}`)
  if (wife) names.push(`מרת ${wife}`)

  // "משפחת <השמות> <שם המשפחה>"
  const parts = ['משפחת']
  if (names.length) parts.push(names.join(' ו'))
  if (family) parts.push(family)

  const line = parts.length > 1 ? parts.join(' ') : ''
  if (!line) return city

  return city ? `${line} - ${city}` : line
}

const MIN_LINES = 8       // מספר השורות הריקות בשובר להדפסה
const LINE_GAP = 30       // מרווח בין השורות
// 🔴 תקרת בטיחות בלבד, לא חיתוך תוכן.
//
// ⚠️ הערך היה 1500 והטקסט נחתך *באמצע משפט* בלי שום סימן. ברכה ארוכה
// עוברת עכשיו לדף שני; התקרה כאן קיימת רק כדי שקלט משובש (הדבקה של
// מסמך שלם) לא ייצור מסמך של מאות עמודים.
const MAX_BODY_CHARS = 20000
const BODY_SIZE = 13

const LINE_COLOR = rgb(0.82, 0.84, 0.88)

function drawLetterTemplate(c: Ctx, input: GratitudeVoucherInput): number {
  let y = drawHeader(c, 'אגף עזר ליולדות')

  y -= 20
  centerText(c, 'דברי ברכה', W / 2, y, 24, NAVY)
  y -= 12
  goldDivider(c, W / 2, y)
  y -= 26

  const infoParts: string[] = []
  if (typeof input.recoveryDays === 'number' && input.recoveryDays > 0) {
    const home = (input.recoveryHome ?? '').trim()
    infoParts.push(home ? `${input.recoveryDays} ימי הבראה בבית ההחלמה ${home}` : `${input.recoveryDays} ימי הבראה`)
  } else if ((input.recoveryHome ?? '').trim()) {
    infoParts.push(`בית ההחלמה ${input.recoveryHome!.trim()}`)
  }
  if (infoParts.length) {
    centerText(c, infoParts.join(' · '), W / 2, y, 12, SUB)
    y -= 16
  }
  if ((input.stayDatesHe ?? '').trim()) {
    centerText(c, input.stayDatesHe!.trim(), W / 2, y, 12, SUB)
    y -= 16
  }
  if ((input.letterDate ?? '').trim()) {
    const d = new Date(input.letterDate!)
    if (!isNaN(d.getTime())) {
      centerText(c, `נכתב בתאריך ${d.toLocaleDateString('he-IL')}`, W / 2, y, 11, SUB)
      y -= 16
    }
  }
  return y - 12
}

/**
 * מצייר מכתב ברכה אחד לתוך מסמך PDF קיים (עמוד אחד או יותר).
 *
 * 🔴 מופרד מ-buildGratitudeVoucher כדי שקובץ מרוכז יוכל לצייר עשרות מכתבים
 * לתוך *אותו* מסמך עם פונט מוטמע *פעם אחת* — לא ליצור מסמך+פונט נפרד לכל
 * מכתב. הטמעת/תחימת הפונט (subset) יקרה, וחזרה עליה 40 פעם היא שהעמיסה
 * על השרת בפועל עד לכשל בקובץ המרוכז.
 */
export async function renderGratitudeLetter(doc: PDFDocument, font: Ctx['font'], logo: Ctx['logo'], input: GratitudeVoucherInput): Promise<void> {
  const page = doc.addPage([W, H])
  const c: Ctx = { page, font, logo }

  let y = drawLetterTemplate(c, input)

  // ── שורות הכתיבה ──
  const lineX0 = MX + 8
  const lineX1 = W - MX - 8
  const maxLineWidth = lineX1 - lineX0 - 12

  // שמירת ירידות שורה שהיולדת כתבה: מפצלים לפסקאות לפי \n, ועוטפים כל פסקה בנפרד.
  // פסקה ריקה (שורה כפולה) נשמרת כשורה ריקה — כדי לא לאבד רווח בין פסקאות.
  const lines: string[] = input.mode === 'filled' && input.body
    ? String(input.body).slice(0, MAX_BODY_CHARS)
        .replace(/\r\n/g, '\n')
        .split('\n')
        .flatMap((para) => {
          const clean = para.replace(/[ \t]+/g, ' ').trim()
          if (!clean) return ['']
          return wrapText(clean, maxLineWidth, (t) => font.widthOfTextAtSize(t, BODY_SIZE))
        })
    : []

  const rowCount = Math.max(MIN_LINES, lines.length)

  // 🔴 ברכה ארוכה עוברת לדף נוסף ואינה נחתכת.
  //
  // ⚠️ קודם הלולאה ציירה את *כל* השורות על דף אחד: מה שלא נכנס נכתב
  // מתחת לתחתית הדף ופשוט נעלם — כשל שקט לחלוטין, כי המסמך נראה תקין
  // ורק המשפט האחרון חסר.
  //
  // ⚠️ מקום שמור לחתימה (SIGN_RESERVE): "בכבוד רב" והחתימה מצוירים אחרי
  // הלולאה, ובלי השריון הם היו נדחקים אל מחוץ לדף האחרון.
  const SIGN_RESERVE = 90
  const BOTTOM = 56

  for (let i = 0; i < rowCount; i++) {
    // ⚠️ השריון נדרש רק לשורה האחרונה — אמצע הטקסט יכול לרדת נמוך יותר.
    const needed = (i === rowCount - 1 ? SIGN_RESERVE : 0) + BOTTOM
    if (y - LINE_GAP < needed) {
      c.page = doc.addPage([W, H])
      y = drawLetterTemplate(c, input)
    }

    c.page.drawLine({
      start: { x: lineX0, y },
      end: { x: lineX1, y },
      thickness: 0.6,
      color: LINE_COLOR,
      dashArray: [3, 3],
    })
    const text = lines[i]
    if (text) rightText(c, text, lineX1 - 4, y + 6, BODY_SIZE, INK)
    y -= LINE_GAP
  }

  // ── בכבוד רב + החתימה ──
  y -= 6
  rightText(c, 'בכבוד רב,', lineX1 - 4, y, 13, NAVY)
  y -= 22

  // החתימה מודפסת בשני המצבים — גם בשובר הריק להדפסה.
  // המשפחה לא צריכה לכתוב את שמה ביד; היא כבר רשומה אצלנו.
  // החתימה מודפסת בשני המצבים — גם בשובר הריק להדפסה.
  // עדיפות input.signature: נדרש כשהמכתב אינו מקושר למוטב רשום (מכתבים
  // ששוחזרו ממייל), ובלעדיו buildSignature היה מחזיר שורה ריקה במקום שורת המשפחה.
  const sig = (input.signature ?? '').trim() || buildSignature(input)
  if (sig) {
    rightText(c, sig.slice(0, 80), lineX1 - 4, y, BODY_SIZE, NAVY)
  } else {
    // אין פרטי משפחה (נדיר) — שורה ריקה למילוי ידני
    // ⚠️ c.page ולא page: אחרי מעבר לדף שני, page מצביע על הראשון
    // והקו היה מצויר שם — הרחק מהחתימה שהוא אמור ללוות.
    c.page.drawLine({
      start: { x: lineX1 - 210, y: y - 2 },
      end: { x: lineX1, y: y - 2 },
      thickness: 0.6,
      color: LINE_COLOR,
      dashArray: [3, 3],
    })
  }

  // ── פרטי זיהוי מתחת לחתימה: ת"ז הבעל והאשה (שורה אחת), ואז רחוב + עיר ──
  const husbandId = (input.husbandId ?? '').trim()
  const wifeId = (input.wifeId ?? '').trim()
  const idParts: string[] = []
  if (husbandId) idParts.push(`תעודת זהות הבעל: ${husbandId}`)
  if (wifeId) idParts.push(`תעודת זהות האשה: ${wifeId}`)
  if (idParts.length) {
    y -= 18
    rightText(c, idParts.join('    '), lineX1 - 4, y, 11, SUB)
  }
  const street = (input.street ?? '').trim()
  const city = (input.city ?? '').trim()
  const addr = [street, city].filter(Boolean).join(', ')
  if (addr) {
    y -= 16
    rightText(c, addr.slice(0, 80), lineX1 - 4, y, 11, SUB)
  }

  // קו זהב מסיים בתחתית
  goldDivider(c, W / 2, 74, 90)
}

/** בונה את שובר דברי הברכה כצרופת PDF (מכתב יחיד — מסמך+פונט משלו). */
export async function buildGratitudeVoucher(input: GratitudeVoucherInput): Promise<MailAttachment> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  const logoBytes = loadLogo()
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null
  await renderGratitudeLetter(doc, font, logo, input)

  const bytes = await doc.save()
  return {
    filename: 'דברי-ברכה.pdf',
    mimeType: 'application/pdf',
    contentB64: Buffer.from(bytes).toString('base64'),
  }
}
