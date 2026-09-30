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

/** מייצר PNG של ברקוד CODE128 עבור המק"ט, ברזולוציה גבוהה להדפסה חדה. */
function makeBarcodePng(sku: string): Uint8Array {
  const canvas = createCanvas(400, 130)
  JsBarcode(canvas as unknown as HTMLCanvasElement, sku, {
    format: 'CODE128',
    displayValue: false, // המק"ט מודפס בטקסט נפרד (פונט עברי-תואם, גודל אחיד עם הכותרת)
    margin: 0,
    width: 2.4,
    height: 90,
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
