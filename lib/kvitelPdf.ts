import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { HEEBO_TTF_B64 } from './assets/heeboFont'
import { toVisual } from './pdfBidi'
import { wrapText } from './rtlText'
import { kvitelDocLayout, type KvitelDocPara } from './kvitelDocLayout'

// קובץ PDF של הקוויטלאך — אותו מבנה כמו קובץ ה-Word והתצוגה (kvitelDocLayout),
// כך שמה שמורידים זהה למה שמודפס. כל טקסט עברי עובר דרך toVisual (pdf-lib לא מפרש bidi).

// toVisual ממרר רק סוגריים עגולים; סוגריים מרובעים (כמו [ערש"ק ...]) ממררים כאן
const visual = (t: string) => toVisual(t).replace(/[[\]]/g, c => (c === '[' ? ']' : '['))

const W = 595.28
const H = 841.89
const MARGIN = 50
const INK = rgb(0.1, 0.1, 0.1)
const RULE = rgb(0.45, 0.45, 0.45)
const LOGO_H = 80
const LOGO_RATIO = 900 / 903

export interface KvitelPdfInput { lines: string[]; date: Date; logoPng?: Uint8Array | null }

export async function buildKvitelPdf({ lines, date, logoPng }: KvitelPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(Buffer.from(HEEBO_TTF_B64, 'base64'), { subset: true })
  let logo: PDFImage | null = null
  try { if (logoPng) logo = await pdf.embedPng(logoPng) } catch { /* לוגו פגום לא ימנע את ההפקה */ }

  const layout = kvitelDocLayout(lines, date)
  let page = pdf.addPage([W, H])
  const drawLogo = (p: PDFPage) => {
    if (logo) p.drawImage(logo, { x: W - MARGIN - LOGO_H * LOGO_RATIO, y: H - MARGIN - LOGO_H, width: LOGO_H * LOGO_RATIO, height: LOGO_H })
  }
  drawLogo(page)

  const right = W - MARGIN
  let y = H - MARGIN
  const rule = (double: boolean) => {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 1, color: RULE })
    if (double) page.drawLine({ start: { x: MARGIN, y: y - 3 }, end: { x: right, y: y - 3 }, thickness: 1, color: RULE })
  }

  const drawPara = (para: KvitelDocPara, isTitle: boolean) => {
    y -= (para.before ?? 0) / 20
    if (!para.run) {
      rule(para.border === 'double')
      y -= (para.border === 'double' ? 4 : 0) + (para.after ?? 0) / 20
      return
    }
    const size = para.run.size / 2
    const lineH = size * 1.45
    const maxW = isTitle ? W - MARGIN * 2 - LOGO_H * LOGO_RATIO * 2 - 20 : right - MARGIN
    const parts = wrapText(para.run.text, maxW, t => font.widthOfTextAtSize(visual(t), size))
    for (const part of parts) {
      if (y - lineH < MARGIN) {
        page = pdf.addPage([W, H])
        y = H - MARGIN
      }
      y -= lineH
      const vis = visual(part)
      const w = font.widthOfTextAtSize(vis, size)
      const x = para.center ? (W - w) / 2 : right - w
      page.drawText(vis, { x, y, size, font: font as PDFFont, color: INK })
    }
    if (para.border === 'single') { y -= 4; rule(false) }
    y -= (para.after ?? 0) / 20
  }

  layout.titles.forEach(p => drawPara(p, true))
  y = Math.min(y, H - MARGIN - LOGO_H) - 14
  layout.body.forEach(p => drawPara(p, false))
  return pdf.save()
}
