import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { createCanvas } from '@napi-rs/canvas'
import { compressFile } from './gilyonotCompress'

// PDF אמיתי עם תמונת JPEG גדולה באיכות 100, כמו גיליון סרוק
async function samplePdf() {
  const c = createCanvas(1600, 2200)
  const g = c.getContext('2d')
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgb(${(i * 37) % 256},${(i * 91) % 256},${(i * 53) % 256})`
    g.fillRect((i * 131) % 1600, (i * 197) % 2200, 40, 40)
  }
  const jpg = c.toBuffer('image/jpeg', 100)
  const doc = await PDFDocument.create()
  const img = await doc.embedJpg(jpg)
  const page = doc.addPage([595, 842])
  page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 })
  return Buffer.from(await doc.save({ useObjectStreams: false }))
}

describe('compressFile', () => {
  it('מכווץ PDF סרוק, ונשאר תקין עם אותם עמודים ואותן מידות תמונה', async () => {
    const orig = await samplePdf()
    const r = await compressFile(orig, 'application/pdf')
    console.log(`PDF לפני ${orig.length} אחרי ${r.after} חיסכון ${r.savedPct}%`)
    expect(r.after).toBeLessThan(orig.length)
    expect(r.worthIt).toBe(true)
    const out = await PDFDocument.load(r.buffer)
    expect(out.getPageCount()).toBe(1)
    expect(out.getPage(0).getSize()).toEqual({ width: 595, height: 842 })
  })

  it('קובץ לא מוכר חוזר כמו שהוא', async () => {
    const buf = Buffer.from('abc')
    const r = await compressFile(buf, 'application/msword')
    expect(r.buffer).toBe(buf)
    expect(r.worthIt).toBe(false)
  })
})
