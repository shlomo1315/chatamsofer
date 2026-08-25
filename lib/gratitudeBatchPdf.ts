// ─────────────────────────────────────────────────────────────────────────────
// קובץ מרוכז של מכתבי הברכה — כל הברכות בטווח, בקובץ אחד להעברה לנדיב.
//
// 🔴 עד כה כל ברכה הופקה בנפרד. מי שרצה לשלוח לנדיב את ברכות השבוע היה
// צריך להוריד אותן אחת-אחת ולאחד ידנית, ולא הייתה לו דרך לדעת אילו כבר
// נשלחו — כך שברכות נשלחו פעמיים ואחרות לא נשלחו כלל.
//
// ⚠️ ליד כל ברכה מופיע מצב המשלוח לנדיב. זה עיקר התועלת: הקורא רואה
// בקובץ עצמו מה חדש ומה כבר נשלח, בלי לחזור למסך.
//
// ⚠️ הפילוח נקבע ב-lib/gratitudeBatch ולא כאן, כדי שהתצוגה המקדימה
// והקובץ יראו בדיוק את אותן ברכות.
// ─────────────────────────────────────────────────────────────────────────────
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import { wrapText } from './rtlText'
import {
  selectBatch, batchStats, wasSentToDonor, rangeLabel,
  SENT_LABEL, STATUS_LABEL, type BatchFilters, type BatchLetter,
} from './gratitudeBatch'

const W = 595.28, H = 841.89, MX = 40
const PAD = 16
const CARD_L = MX, CARD_R = W - MX
const TXT_R = CARD_R - PAD
const TXT_W = (CARD_R - CARD_L) - PAD * 2
const NAVY = rgb(0.106, 0.196, 0.337)
const GOLD = rgb(0.776, 0.616, 0.176)
const INK = rgb(0.12, 0.15, 0.2)
const SUB = rgb(0.42, 0.46, 0.52)
const LIGHT = rgb(0.95, 0.96, 0.98)
const CARD_BORDER = rgb(0.85, 0.87, 0.9)
const BODY_BG = rgb(0.985, 0.98, 0.96)
const SENT_BG = rgb(0.90, 0.96, 0.93), SENT_INK = rgb(0.06, 0.42, 0.28)
const NEW_BG = rgb(0.99, 0.94, 0.86), NEW_INK = rgb(0.60, 0.35, 0.03)
const TOP = H - 50, BOTTOM = 50

const TITLE_SZ = 13, META_SZ = 9, BODY_SZ = 10.5, SIG_SZ = 10, TAG_SZ = 8.5
const LINE_GAP = 4.5

/** ברכה כפי שהיא נכנסת לקובץ. */
export interface BatchLetterFull extends BatchLetter {
  body?: string | null
  signature?: string | null
  is_anonymous?: boolean | null
  source?: string | null
  /** שם היולדת — מחושב מראש בצד הקורא. */
  motherName?: string | null
  /** תאריך הלידה, לזיהוי התיק. */
  birthDate?: string | null
  scan_url?: string | null
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

function clean(s: string): string {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(strong|b|em|i|u|a|span|div|p)[^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** תאריך ISO → dd/mm/yyyy. ⚠️ חיתוך מחרוזת ולא Date — ראו dayOf. */
function heDate(iso?: string | null): string {
  const d = String(iso ?? '').slice(0, 10)
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—'
}

interface Ctx { page: PDFPage; font: PDFFont; y: number; pdf: PDFDocument }

function newPage(c: Ctx) { c.page = c.pdf.addPage([W, H]); c.y = TOP }

function rightText(c: Ctx, text: string, xRight: number, size: number, color = INK) {
  const t = String(text ?? '')
  const w = c.font.widthOfTextAtSize(t, size)
  c.page.drawText(t, { x: xRight - w, y: c.y, size, font: c.font, color })
}

function wrapParagraph(c: Ctx, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = []
  for (const rawLine of clean(text).split('\n')) {
    if (!rawLine.trim()) { out.push(''); continue }
    out.push(...wrapText(rawLine, maxWidth, s => c.font.widthOfTextAtSize(s, size)))
  }
  return out
}

/** מה נכתב בגוף הברכה. סריקה אינה טקסט — נאמר זאת במפורש. */
function bodyTextOf(l: BatchLetterFull): string {
  const t = clean(l.body ?? '')
  if (t) return t
  // ⚠️ ברכה סרוקה אינה נכנסת כתמונה לקובץ המרוכז: עשרות סריקות היו
  // מנפחות אותו למאות מגה, וקובץ כזה אינו נשלח במייל. נאמר במפורש
  // שהיא קיימת ומאיפה לקחת אותה, ולא מושמטת בשקט.
  if ((l.scan_url ?? '').trim()) return '[ברכה סרוקה — הקובץ זמין במערכת, במסך מכתבי הברכה]'
  return '[ללא טקסט]'
}

/** מדידת גובה הכרטיס — כדי לא לחתוך ברכה בין עמודים. */
function measure(c: Ctx, l: BatchLetterFull): number {
  let h = PAD * 2
  h += TITLE_SZ + 6            // שם היולדת
  h += META_SZ + 12            // שורת מטא
  const lines = wrapParagraph(c, bodyTextOf(l), BODY_SZ, TXT_W - 16)
  h += lines.length * (BODY_SZ + LINE_GAP) + 10
  if (clean(l.signature ?? '')) h += SIG_SZ + 8
  return h
}

export interface BatchPdfInput {
  letters: BatchLetterFull[]
  filters: BatchFilters
  /** שם המסמך בכותרת. ברירת מחדל: "מכתבי ברכה". */
  title?: string
}

export async function buildGratitudeBatchPdf(input: BatchPdfInput): Promise<Uint8Array> {
  const rows = selectBatch(input.letters, input.filters)
  const stats = batchStats(rows)

  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(base64ToBytes(HEEBO_TTF_B64), { subset: true })

  const c: Ctx = { page: pdf.addPage([W, H]), font, y: TOP, pdf }

  // ── כותרת המסמך ──
  rightText(c, input.title ?? 'מכתבי ברכה', CARD_R, 24, NAVY); c.y -= 28
  rightText(c, 'היכל החתם סופר · אגף עזר ליולדות', CARD_R, 11, SUB); c.y -= 16
  rightText(c, `תקופה: ${rangeLabel(input.filters.from, input.filters.to)}`, CARD_R, 11, INK); c.y -= 15

  // ⚠️ הפילוח שנבחר נכתב במסמך: הקורא חייב לדעת אם ראה הכול או חלק,
  // אחרת קובץ של "טרם נשלחו" נראה כמו כל הברכות של התקופה.
  const picked = [SENT_LABEL[input.filters.sent ?? 'all'], STATUS_LABEL[input.filters.status ?? 'all']]
  rightText(c, `סינון: ${picked.join('  ·  ')}`, CARD_R, 9.5, SUB); c.y -= 20

  // ── פס פילוח ──
  c.page.drawRectangle({ x: CARD_L, y: c.y - 8, width: CARD_R - CARD_L, height: 26, color: LIGHT })
  const sumLine = `סה״כ ${stats.total} ברכות  ·  ${stats.unsent} טרם נשלחו לנדיב  ·  ${stats.sent} נשלחו  ·  ${stats.approved} מאושרות`
  rightText(c, sumLine, CARD_R - 10, 10, NAVY)
  c.y -= 38

  if (rows.length === 0) {
    // ⚠️ קובץ ריק אינו נשלח בלי הסבר — אחרת הוא נראה כתקלה.
    rightText(c, 'לא נמצאו ברכות התואמות לסינון שנבחר.', CARD_R, 12, SUB)
    return pdf.save()
  }

  for (const l of rows) {
    const cardH = measure(c, l)
    if (c.y - cardH < BOTTOM && cardH < TOP - BOTTOM) newPage(c)

    const cardTop = c.y
    c.y -= PAD

    // ── שם היולדת + תגית מצב המשלוח ──
    // ⚠️ ברכה אנונימית — השם אינו מוצג. זו בקשה מפורשת של היולדת, והקובץ
    // הזה נשלח החוצה לנדיב.
    const name = l.is_anonymous ? 'ברכה אנונימית' : (clean(l.motherName ?? '') || '—')
    rightText(c, name, TXT_R, TITLE_SZ, NAVY)

    // 🔴 התגית היא עיקר התועלת: משמאל לשם, ירוק=נשלח / כתום=טרם נשלח.
    // בלעדיה אין דרך לדעת בקובץ עצמו מה כבר עבר לנדיב.
    const sent = wasSentToDonor(l)
    const tag = sent ? `נשלח לנדיב · ${heDate(l.sent_to_donor_at)}` : 'טרם נשלח לנדיב'
    const tagW = font.widthOfTextAtSize(tag, TAG_SZ) + 14
    c.page.drawRectangle({
      x: CARD_L + PAD, y: c.y - 4, width: tagW, height: 15,
      color: sent ? SENT_BG : NEW_BG,
    })
    c.page.drawText(tag, {
      x: CARD_L + PAD + 7, y: c.y, size: TAG_SZ, font,
      color: sent ? SENT_INK : NEW_INK,
    })
    c.y -= TITLE_SZ + 6

    // ── שורת מטא ──
    const meta = [
      `התקבלה: ${heDate(l.created_at)}`,
      l.birthDate ? `לידה: ${heDate(l.birthDate)}` : null,
      l.status === 'approved' ? 'מאושרת' : l.status === 'rejected' ? 'נדחתה' : 'ממתינה לאישור',
    ].filter(Boolean).join('  ·  ')
    rightText(c, meta, TXT_R, META_SZ, SUB)
    c.y -= META_SZ + 12

    // ── גוף הברכה ──
    const lines = wrapParagraph(c, bodyTextOf(l), BODY_SZ, TXT_W - 16)
    const boxH = lines.length * (BODY_SZ + LINE_GAP) + 8
    c.page.drawRectangle({
      x: CARD_L + PAD, y: c.y - boxH + BODY_SZ, width: TXT_W, height: boxH,
      color: BODY_BG, borderColor: CARD_BORDER, borderWidth: 0.5,
    })
    c.y -= 2
    for (const ln of lines) {
      if (ln) rightText(c, ln, TXT_R - 8, BODY_SZ, INK)
      c.y -= BODY_SZ + LINE_GAP
    }
    c.y -= 6

    // ── חתימה ──
    // ⚠️ בברכה אנונימית החתימה מדולגת אך המקום נשמר, כדי שגובה הכרטיס
    // יתאים למדידה — אחרת המסגרת נחתכת.
    const sig = clean(l.signature ?? '')
    if (sig && !l.is_anonymous) { rightText(c, sig, TXT_R - 8, SIG_SZ, NAVY); c.y -= SIG_SZ + 8 }
    else if (sig) { c.y -= SIG_SZ + 8 }

    c.y -= PAD
    c.page.drawRectangle({
      x: CARD_L, y: c.y, width: CARD_R - CARD_L, height: cardTop - c.y,
      borderColor: CARD_BORDER, borderWidth: 1,
    })
    c.page.drawRectangle({ x: CARD_L, y: cardTop - 3, width: CARD_R - CARD_L, height: 3, color: GOLD })
    c.y -= 16
  }

  return pdf.save()
}
