// ─────────────────────────────────────────────────────────────
// המרת עמוד PDF לתמונת PNG *בצד השרת*.
//
// למה זה קיים: נטפרי מיירט תגובות שסוג התוכן שלהן application/pdf ושולח
// אותן "לבדיקה", ובמקום המסמך הדפדפן מקבל את דף החסימה של נטפרי. זה קורה
// גם כשהקובץ מוגש מהדומיין שלנו (chasamsofer.co.il) — הסינון הוא לפי סוג
// התוכן, לא לפי הדומיין. לכן כל עוד PDF עובר על החוט, התצוגה תישבר.
//
// הפתרון: להמיר את העמוד לתמונה כאן בשרת, ולשלוח לדפדפן PNG רגיל בלבד.
// אף PDF לא עובר בחוט בתצוגה המקדימה — ולכן אין מה לשלוח לבדיקה והתצוגה
// מיידית. זו גם הדרך שבה Gmail/Drive מייצרים תצוגות מקדימות למסמכים.
// ─────────────────────────────────────────────────────────────
import { createRequire } from 'node:module'

// pdfjs טוען את גופני הבסיס (Helvetica וכו') מהדיסק. בלי הנתיב הזה
// טקסט בגופנים לא-מוטמעים מרונדר חלקית ומופיעה אזהרה בלוג.
function standardFontsDir(): string | undefined {
  try {
    const require = createRequire(import.meta.url)
    const pkg = require.resolve('pdfjs-dist/package.json')
    return `${pkg.slice(0, pkg.lastIndexOf('/'))}/standard_fonts/`
  } catch {
    return undefined
  }
}

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsPromise: Promise<PdfjsModule> | null = null

// טעינה עצלה — pdfjs כבד, ורוב הבקשות לשרת אינן נוגעות ב-PDF בכלל.
function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjsPromise
}

export interface RasterResult {
  png: Buffer
  pages: number
  width: number
  height: number
}

// רוחב מרבי לתמונה המיוצרת — תקרה שמונעת רינדור ענק מ-PDF בגודל פוסטר.
const MAX_WIDTH = 2000
// תקרת פיקסלים לתמונה מוטמעת בתוך ה-PDF (הגנה מפני "פצצת פענוח")
const MAX_IMAGE_PIXELS = 50_000_000

/**
 * ממיר עמוד יחיד מתוך PDF לתמונת PNG.
 * @param data בייטים של קובץ ה-PDF
 * @param page מספר העמוד (1-based); ערך מחוץ לטווח נחתך לעמוד הקיים הקרוב
 * @param width רוחב היעד בפיקסלים
 */
export async function rasterizePdfPage(
  data: Uint8Array,
  page = 1,
  width = 900,
): Promise<RasterResult> {
  const [pdfjs, { createCanvas }] = await Promise.all([loadPdfjs(), import('@napi-rs/canvas')])

  const task = pdfjs.getDocument({
    data,
    standardFontDataUrl: standardFontsDir(),
    // מסמכים סרוקים מגיעים מגורמים חיצוניים — לא לאפשר טעינת משאבים מהרשת
    useSystemFonts: false,
    // תקרה לתמונה מוטמעת — מגן מפני PDF זדוני שמנפח זיכרון בפענוח
    maxImageSize: MAX_IMAGE_PIXELS,
  })

  const pdf = await task.promise
  try {
    const pageNum = Math.min(Math.max(1, Math.trunc(page)), pdf.numPages)
    const p = await pdf.getPage(pageNum)

    const base = p.getViewport({ scale: 1 })
    const target = Math.min(Math.max(80, Math.trunc(width)), MAX_WIDTH)
    const viewport = p.getViewport({ scale: target / base.width })

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    // רקע לבן — PDF שקוף היה מתקבל כתמונה שחורה/שקופה בתצוגה
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // @napi-rs/canvas תואם ל-API של קנבס דפדפן; ההמרה נדרשת רק לטיפוסים
    await p.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise

    return {
      png: canvas.toBuffer('image/png'),
      pages: pdf.numPages,
      width: canvas.width,
      height: canvas.height,
    }
  } finally {
    // שחרור הזיכרון של המסמך — בלעדיו דליפה מצטברת על שרת ארוך-חיים
    await task.destroy().catch(() => {})
  }
}

/** מספר העמודים במסמך, בלי לרנדר אותו. */
export async function pdfPageCount(data: Uint8Array): Promise<number> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data, useSystemFonts: false, maxImageSize: MAX_IMAGE_PIXELS })
  const pdf = await task.promise
  try {
    return pdf.numPages
  } finally {
    await task.destroy().catch(() => {})
  }
}
