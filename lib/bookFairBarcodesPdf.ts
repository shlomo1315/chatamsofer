import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import JsBarcode from 'jsbarcode'
import { createCanvas } from '@napi-rs/canvas'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import { toVisual } from './pdfBidi'

// ─────────────────────────────────────────────────────────────────────────────
// גיליון תוויות ברקוד ליריד הספרים — להדפסה, חיתוך, והדבקה/תלייה ליד
// כל ספר על השולחן. סריקה בקופה (טלפון/סורק ידני) מזהה את המק"ט מיד.
//
// 🔴 הברקוד מקודד את המק"ט (sku) ולא את מזהה השורה (id): המק"ט כבר
// ייחודי, קצר, ומודפס גם על גבי הקטלוג עצמו — סריקה שמזהה "0806" יכולה
// להיבדק בעין מול התווית, בעוד UUID אינו ניתן לאימות אנושי.
//
// ⚠️ pdf-lib אינו מפרש bidi: שם ספר עברי עובר toVisual (lib/pdfBidi),
// בדיוק כמו בכל שאר מסמכי ה-PDF בפרויקט (ראו lib/centerListPdf.ts).
// המק"ט עצמו (ספרות בלבד) נכתב כמות שהוא, בלי toVisual.
// ─────────────────────────────────────────────────────────────────────────────

export interface BarcodeLabelInput {
  sku: string
  title: string
}

// A4 לאורך
const W = 595.28
const H = 841.89
const MARGIN = 24

// ── רשת 3×8 = 24 תוויות לעמוד ──
const COLS = 3
const ROWS = 8
const GUTTER = 6
const LABEL_W = (W - MARGIN * 2 - GUTTER * (COLS - 1)) / COLS
const LABEL_H = (H - MARGIN * 2 - GUTTER * (ROWS - 1)) / ROWS
const PER_PAGE = COLS * ROWS

const INK = rgb(0.10, 0.11, 0.15)
const BORDER = rgb(0.82, 0.84, 0.88)

/**
 * מייצר PNG של ברקוד CODE128 עבור המק"ט.
 *
 * 🔴 width גבוה בכוונה (6, לא 2.4): נבדק בפועל (רינדור PDF ל-300 DPI +
 * פענוח עם ZXing) שרוחב פס נמוך נשבר בהגדלה מ-PDF להדפסה — האנטי-
 * אליאסינג בהמרה מטשטש קצוות בצורה לא אחידה, ורוחבי המודולים בפועל
 * יוצאים לא-אחידים (למשל 8/5/13/4 פיקסלים באותו ברקוד, שם הכל אמור
 * להיות כפולות של מודול אחד). ברקוד "רזה" נראה תקין בעין ונכשל בסורק
 * אמיתי. width=6 מרחיב כל מודול פי 2.5, כך שאותה טעות טשטוש הופכת
 * לחלק זניח מרוחב הפס ולא לרובו.
 */
function makeBarcodePng(sku: string): Uint8Array {
  const canvas = createCanvas(800, 220)
  JsBarcode(canvas as unknown as HTMLCanvasElement, sku, {
    format: 'CODE128',
    displayValue: false, // המק"ט מודפס בטקסט נפרד (פונט עברי-תואם, גודל אחיד עם הכותרת)
    margin: 0,
    width: 6,
    height: 160,
  })
  return canvas.toBuffer('image/png')
}

/** חיתוך שם ספר ארוך לשתי שורות לכל היותר, לפי רוחב התווית. */
function wrapTitle(font: PDFFont, title: string, size: number, maxW: number): string[] {
  const words = title.trim().split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w
    if (font.widthOfTextAtSize(toVisual(candidate), size) <= maxW || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = w
    }
    if (lines.length === 2) break
  }
  if (lines.length < 2 && current) lines.push(current)
  return lines.slice(0, 2)
}

/**
 * גיליון A4 עם תוויות ברקוד לכל הספרים שסופקו — 24 לעמוד, 3 עמודות.
 * כל תווית: שם הספר (מודגש, עד שתי שורות) ומתחתיו ברקוד + מק"ט.
 */
export async function buildBookFairBarcodesPdf(books: BarcodeLabelInput[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })

  // ⚠️ ברקוד מוטמע פעם אחת לכל ספר (לא לכל תווית — יש רק תווית אחת
  // לכל ספר), אבל embedPng עדיין נקרא unique per-sku כדי לא להחזיק
  // בזיכרון את כל 100+ ה-PNG-ים בו-זמנית לפני שהם נדרשים.
  for (let i = 0; i < books.length; i += PER_PAGE) {
    const pageBooks = books.slice(i, i + PER_PAGE)
    const page = pdf.addPage([W, H])

    for (let j = 0; j < pageBooks.length; j++) {
      const book = pageBooks[j]
      const col = j % COLS
      const row = Math.floor(j / COLS)
      const x = MARGIN + col * (LABEL_W + GUTTER)
      const yTop = H - MARGIN - row * (LABEL_H + GUTTER)
      const yBottom = yTop - LABEL_H

      page.drawRectangle({
        x, y: yBottom, width: LABEL_W, height: LABEL_H,
        borderColor: BORDER, borderWidth: 0.6,
      })

      // ── שם הספר, מודגש, עד שתי שורות, ממורכז ──
      const titleSize = 10.5
      const lines = wrapTitle(font, book.title, titleSize, LABEL_W - 12)
      let textY = yTop - 16
      for (const line of lines) {
        const v = toVisual(line)
        const w = font.widthOfTextAtSize(v, titleSize)
        page.drawText(v, { x: x + (LABEL_W - w) / 2, y: textY, size: titleSize, font, color: INK })
        textY -= 13
      }

      // ── ברקוד + מק"ט מתחתיו ──
      //
      // 🔴 הגובה נקבע ראשית (לא נגזר מיחס התמונה): JsBarcode משנה את
      // מאפייני ה-canvas עצמו לגודל התוכן שצייר (תלוי אורך המק"ט),
      // לא לגודל שביקשנו ב-createCanvas. גזירת bh מהיחס width/height
      // של אותה תמונה נתנה גובה גדול מגובה התווית כולה — הברקוד בלע
      // את מקום הכותרת. bw נגזר מ-bh, לא להפך, ומוגבל לרוחב התווית.
      const barcodePng = makeBarcodePng(book.sku)
      const barcodeImg = await pdf.embedPng(barcodePng)
      const maxBh = 34 // גובה קבוע וזהה לכל התוויות, ללא תלות באורך המק"ט
      let bw = maxBh * (barcodeImg.width / barcodeImg.height)
      let bh = maxBh
      const maxBw = LABEL_W - 20
      if (bw > maxBw) { bh = bh * (maxBw / bw); bw = maxBw }
      const by = yBottom + 16
      page.drawImage(barcodeImg, { x: x + (LABEL_W - bw) / 2, y: by, width: bw, height: bh })

      const skuSize = 9
      const skuW = font.widthOfTextAtSize(book.sku, skuSize)
      page.drawText(book.sku, {
        x: x + (LABEL_W - skuW) / 2, y: by - 11, size: skuSize, font, color: INK,
      })
    }
  }

  return pdf.save()
}

// ─────────────────────────────────────────────────────────────────────────────
// דף מלא לכל ספר — 45 תוויות נמוכות זהות של אותו ספר, לגב ספר צר
// (בקשת המשתמש 05.10).
//
// אותו גודל תווית ואותה רשת 3×8 כמו בגיליון המשותף. שם הספר עובר לפס
// צר בצד שמאל, לאורך, נקרא מלמטה למעלה. בלי הכותרת למעלה הברקוד גבוה
// יותר — קל יותר לסריקה.
//
// 🔴 כל השם נכנס תמיד — שורה אחת, מוקטנת, או שתי שורות
// (lib/bookFairSideTitle). אין חיתוך ואין "...".
// ─────────────────────────────────────────────────────────────────────────────

const STRIP_PAD = 2.5
const DIVIDER = rgb(0.89, 0.90, 0.93)

// ── רשת נמוכה לגב ספר צר (בקשת המשתמש 05.10): 3×15 = 45 תוויות לעמוד ──
// גובה תווית ~47pt ≈ 16.7 מ"מ (במקום ~94pt). הברקוד נשאר ברוחב מלא —
// הסורק קורא את הרוחב, והגובה (~9 מ"מ) מספיק לסריקה.
const SPINE_ROWS = 15
const SPINE_LABEL_H = (H - MARGIN * 2 - GUTTER * (SPINE_ROWS - 1)) / SPINE_ROWS
const SPINE_PER_PAGE = COLS * SPINE_ROWS

export async function buildBookFairBarcodeSheetsPdf(
  books: BarcodeLabelInput[],
  pagesPerBook = 1,
): Promise<Uint8Array> {
  const { layoutSideTitle } = await import('./bookFairSideTitle')
  const { degrees } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  const measure = (t: string, s: number) => font.widthOfTextAtSize(toVisual(t), s)
  const pages = Math.max(1, Math.min(20, Math.floor(pagesPerBook)))

  for (const book of books) {
    // ⚠️ ברקוד אחד לספר, מוטמע פעם אחת ומשמש את כל 24×N התוויות.
    const barcodeImg = await pdf.embedPng(makeBarcodePng(book.sku))
    const layout = layoutSideTitle(book.title, measure, SPINE_LABEL_H - 6)
    const stripW = layout.thickness + STRIP_PAD * 2

    for (let p = 0; p < pages; p++) {
      const page = pdf.addPage([W, H])
      for (let j = 0; j < SPINE_PER_PAGE; j++) {
        const col = j % COLS
        const row = Math.floor(j / COLS)
        const x = MARGIN + col * (LABEL_W + GUTTER)
        const yTop = H - MARGIN - row * (SPINE_LABEL_H + GUTTER)
        const yBottom = yTop - SPINE_LABEL_H

        page.drawRectangle({ x, y: yBottom, width: LABEL_W, height: SPINE_LABEL_H, borderColor: BORDER, borderWidth: 0.6 })

        // ── פס השם בצד שמאל ──
        page.drawLine({
          start: { x: x + stripW, y: yBottom + 3 }, end: { x: x + stripW, y: yTop - 3 },
          thickness: 0.5, color: DIVIDER, dashArray: [2, 2],
        })
        // ⚠️ סיבוב 90° נגד כיוון השעון: "למעלה" של הטקסט פונה שמאלה, ולכן
        // השורה הראשונה היא השמאלית, וקו הבסיס שלה מוזז ימינה בגובה האות.
        layout.lines.forEach((line, k) => {
          const v = toVisual(line)
          const w = font.widthOfTextAtSize(v, layout.size)
          const bx = x + STRIP_PAD + layout.size * 0.85 + k * layout.size * 1.15
          const by = yBottom + (SPINE_LABEL_H - w) / 2
          page.drawText(v, { x: bx, y: by, size: layout.size, font, color: INK, rotate: degrees(90) })
        })

        // ── ברקוד + מק"ט, ממורכזים באזור שמימין לפס ──
        const ax = x + stripW
        const aw = LABEL_W - stripW
        const skuSize = 7
        let bh = 26
        let bw = bh * (barcodeImg.width / barcodeImg.height)
        const maxBw = aw - 12
        if (bw > maxBw) { bh = bh * (maxBw / bw); bw = maxBw }
        const blockH = bh + 4 + skuSize
        const by = yBottom + (SPINE_LABEL_H - blockH) / 2 + skuSize + 4
        page.drawImage(barcodeImg, { x: ax + (aw - bw) / 2, y: by, width: bw, height: bh })
        const skuW = font.widthOfTextAtSize(book.sku, skuSize)
        page.drawText(book.sku, { x: ax + (aw - skuW) / 2, y: by - skuSize - 2, size: skuSize, font, color: INK })
      }
    }
  }

  return pdf.save()
}

// ─────────────────────────────────────────────────────────────────────────────
// מדבקה בודדת 7×3.5 ס"מ — עמוד לכל מדבקה (בקשת המשתמש 05.10), למדפסת
// מדבקות בגליל. גודל העמוד = גודל המדבקה, בלי מסגרת ובלי רשת.
//
// מבנה: שם הספר למעלה (עד 2-3 שורות, מוקטן לפי הצורך — 🔴 תמיד כולו),
// הברקוד באמצע, המק"ט מתחתיו.
// ─────────────────────────────────────────────────────────────────────────────

const MM = 72 / 25.4
export const STICKER_W = 70 * MM // 7 ס"מ
export const STICKER_H = 35 * MM // 3.5 ס"מ
const ST_PAD = 2.5 * MM

export async function buildBookFairStickersPdf(
  books: BarcodeLabelInput[],
  copiesPerBook = 1,
): Promise<Uint8Array> {
  const { layoutStickerTitle } = await import('./bookFairStickerTitle')
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  const measure = (t: string, s: number) => font.widthOfTextAtSize(toVisual(t), s)
  const copies = Math.max(1, Math.min(200, Math.floor(copiesPerBook)))

  const innerW = STICKER_W - ST_PAD * 2
  const skuSize = 8
  const titleMaxH = 30

  for (const book of books) {
    const barcodeImg = await pdf.embedPng(makeBarcodePng(book.sku))
    const title = layoutStickerTitle(book.title, measure, innerW, titleMaxH)

    // ── הברקוד ממלא את מה שנשאר בין הכותרת למק"ט ──
    const gap = 3
    const availH = STICKER_H - ST_PAD * 2 - title.height - gap - skuSize - 2
    let bh = Math.min(availH, 46)
    let bw = bh * (barcodeImg.width / barcodeImg.height)
    if (bw > innerW) { bh = bh * (innerW / bw); bw = innerW }

    // מרכוז אנכי של כל הבלוק
    const blockH = title.height + gap + bh + 2 + skuSize
    const top = STICKER_H - (STICKER_H - blockH) / 2

    for (let c = 0; c < copies; c++) {
      const page = pdf.addPage([STICKER_W, STICKER_H])

      title.lines.forEach((line, k) => {
        const v = toVisual(line)
        const w = font.widthOfTextAtSize(v, title.size)
        const y = top - title.size * 0.9 - k * title.size * 1.15
        page.drawText(v, { x: (STICKER_W - w) / 2, y, size: title.size, font, color: INK })
      })

      const by = top - title.height - gap - bh
      page.drawImage(barcodeImg, { x: (STICKER_W - bw) / 2, y: by, width: bw, height: bh })

      const skuW = font.widthOfTextAtSize(book.sku, skuSize)
      page.drawText(book.sku, { x: (STICKER_W - skuW) / 2, y: by - 2 - skuSize * 0.85, size: skuSize, font, color: INK })
    }
  }

  return pdf.save()
}
