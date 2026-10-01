const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const { readFileSync } = await import('node:fs')
const data = new Uint8Array(readFileSync('קטלוג היכל החתם סופר.pdf'))
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
for (let pn = 1; pn <= doc.numPages; pn++) {
  const page = await doc.getPage(pn)
  const tc = await page.getTextContent()
  const full = tc.items.map(i=>i.str).join(' ')
  const skus = full.match(/\b0[1-9]\d{2}\b/g) || []
  const ops = await page.getOperatorList()
  // ספירת תמונות
  let imgs = 0
  for (const f of ops.fnArray) if (f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintJpegXObject) imgs++
  console.log(`page ${String(pn).padStart(2)}: skus=${String(skus.length).padStart(3)} imgs=${String(imgs).padStart(3)}  ${skus.slice(0,8).join(',')}`)
}
