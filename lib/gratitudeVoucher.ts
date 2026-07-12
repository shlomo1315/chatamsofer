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
  W, H, MX, NAVY, GOLD, SUB, INK,
  type Ctx, loadLogo, drawHeader, centerText, rightText, goldDivider, paragraph, drawIssueDate,
} from './maternityVoucher'
import type { MailAttachment } from './sendMail'

export interface GratitudeVoucherInput {
  mode: 'blank' | 'filled'
  body?: string           // הטקסט שהיולדת כתבה (רק ב-filled)
  signature?: string      // שורת החתימה שבחרה
  familyName?: string     // מודפס רק אם isAnonymous=false
  isAnonymous?: boolean   // ברירת מחדל: אנונימי
}

const MIN_LINES = 8       // מספר השורות הריקות בשובר להדפסה
const LINE_GAP = 30       // מרווח בין השורות
const MAX_BODY_CHARS = 1500
const BODY_SIZE = 13

const LINE_COLOR = rgb(0.82, 0.84, 0.88)

/** בונה את שובר דברי הברכה כצרופת PDF. */
export async function buildGratitudeVoucher(input: GratitudeVoucherInput): Promise<MailAttachment> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  const logoBytes = loadLogo()
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null
  const page = doc.addPage([W, H])
  const c: Ctx = { page, font, logo }

  let y = drawHeader(c, 'אגף עזר ליולדות')

  // שובר נקי: רק "דברי ברכה", השורות, ו"בכבוד רב".
  // (ללא תאריך הנפקה, כותרת משנה, או פסקת הסבר — לבקשת הלקוח.)
  y -= 20
  centerText(c, 'דברי ברכה', W / 2, y, 24, NAVY)
  y -= 12
  goldDivider(c, W / 2, y)
  y -= 34

  // ── שורות הכתיבה ──
  const lineX0 = MX + 8
  const lineX1 = W - MX - 8
  const maxLineWidth = lineX1 - lineX0 - 12

  const lines: string[] = input.mode === 'filled' && input.body
    ? wrapText(
        String(input.body).slice(0, MAX_BODY_CHARS).replace(/\s+/g, ' ').trim(),
        maxLineWidth,
        (t) => font.widthOfTextAtSize(t, BODY_SIZE),
      )
    : []

  const rowCount = Math.max(MIN_LINES, lines.length)
  for (let i = 0; i < rowCount; i++) {
    page.drawLine({
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

  // ── בכבוד רב + שורת החתימה ──
  y -= 6
  rightText(c, 'בכבוד רב,', lineX1 - 4, y, 13, NAVY)
  y -= 28

  const sigLineX0 = lineX1 - 210
  page.drawLine({
    start: { x: sigLineX0, y },
    end: { x: lineX1, y },
    thickness: 0.6,
    color: LINE_COLOR,
    dashArray: [3, 3],
  })

  // חתימה — רק אם המשתמשת אישרה שיופיע שמה.
  // אנונימי = שורת החתימה נשארת ריקה לגמרי (לא מודפס שום תחליף).
  if (input.mode === 'filled' && input.isAnonymous === false) {
    const sig = (input.signature ?? '').trim()
      || (input.familyName ? `משפחת ${input.familyName}` : '')
    if (sig) rightText(c, sig.slice(0, 60), lineX1 - 4, y + 6, BODY_SIZE, INK)
  }

  // קו זהב מסיים בתחתית
  goldDivider(c, W / 2, 74, 90)

  const bytes = await doc.save()
  return {
    filename: 'דברי-ברכה.pdf',
    mimeType: 'application/pdf',
    contentB64: Buffer.from(bytes).toString('base64'),
  }
}
