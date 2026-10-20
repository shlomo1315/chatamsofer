import { PDFDocument, PDFName, PDFRawStream, PDFNumber, PDFDict } from 'pdf-lib'
import JSZip from 'jszip'
import { createCanvas, loadImage } from '@napi-rs/canvas'

// ─────────────────────────────────────────────────────────────────────────────
// כיווץ קובץ גיליון בלי פגיעה נראית באיכות: בלי הקטנת מידות ובלי הורדת רזולוציה.
//   PDF  – שמירה מחדש עם object streams, והמרה מחדש של תמונות JPEG באיכות 90.
//   תמונה – JPEG באיכות 90 / PNG מחדש, באותן מידות.
//   Word (docx) – דחיסה מחדש של ה-zip (רמה 9). doc ישן לא נדחס.
// הפונקציה מחזירה תמיד תוצאה, ואם לא נחסך כלום – את המקור.
// ─────────────────────────────────────────────────────────────────────────────

export const JPEG_QUALITY = 90
/** חיסכון קטן מזה נחשב זניח: כותבים את זה ולא מחליפים קובץ. */
export const MIN_WORTH_SAVING = 0.05

export interface CompressResult { buffer: Buffer; before: number; after: number; savedPct: number; worthIt: boolean }

function result(orig: Buffer, out: Buffer): CompressResult {
  const smaller = out.length < orig.length
  const buffer = smaller ? out : orig
  const savedPct = Math.round((1 - buffer.length / orig.length) * 1000) / 10
  return { buffer, before: orig.length, after: buffer.length, savedPct, worthIt: smaller && 1 - buffer.length / orig.length >= MIN_WORTH_SAVING }
}

async function recompressJpeg(buf: Buffer): Promise<Buffer> {
  const img = await loadImage(buf)
  const canvas = createCanvas(img.width, img.height)
  canvas.getContext('2d').drawImage(img, 0, 0)
  return canvas.toBuffer('image/jpeg', JPEG_QUALITY)
}

async function compressPdf(orig: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(orig, { updateMetadata: false, ignoreEncryption: false })
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const d = obj.dict
    if (d.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue
    if (d.get(PDFName.of('Filter')) !== PDFName.of('DCTDecode')) continue
    if (d.get(PDFName.of('ColorSpace')) !== PDFName.of('DeviceRGB')) continue // לא נוגעים ב-CMYK ובגווני אפור
    if (d.get(PDFName.of('Decode')) || d.get(PDFName.of('Mask'))) continue
    const old = Buffer.from(obj.contents)
    try {
      const fresh = await recompressJpeg(old)
      if (fresh.length >= old.length * 0.97) continue
      const dict: PDFDict = d.clone()
      dict.set(PDFName.of('Length'), PDFNumber.of(fresh.length))
      doc.context.assign(ref, PDFRawStream.of(dict, fresh))
    } catch { /* תמונה שלא נקראה נשארת כמו שהיא */ }
  }
  return Buffer.from(await doc.save({ useObjectStreams: true }))
}

async function compressImage(orig: Buffer, mime: string): Promise<Buffer> {
  const img = await loadImage(orig)
  const canvas = createCanvas(img.width, img.height)
  canvas.getContext('2d').drawImage(img, 0, 0)
  return mime === 'image/png' ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', JPEG_QUALITY)
}

async function compressDocx(orig: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(orig)
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }))
}

export async function compressFile(orig: Buffer, mime: string): Promise<CompressResult> {
  try {
    if (mime === 'application/pdf') return result(orig, await compressPdf(orig))
    if (mime === 'image/jpeg' || mime === 'image/png') return result(orig, await compressImage(orig, mime))
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return result(orig, await compressDocx(orig))
  } catch (e) {
    console.error('[gilyonot] כיווץ נכשל:', e instanceof Error ? e.message : e)
  }
  return result(orig, orig)
}

export const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
}
