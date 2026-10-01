const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const { readFileSync } = await import('node:fs')
const data = new Uint8Array(readFileSync('קטלוג היכל החתם סופר.pdf'))
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
const page = await doc.getPage(6)
const vp = page.getViewport({ scale: 1 })
console.log('page6:', vp.width.toFixed(0), 'x', vp.height.toFixed(0))
const tc = await page.getTextContent()
console.log('--- טקסט ---')
tc.items.filter(i=>i.str.trim()).slice(0,30).forEach(it =>
  console.log(`  y=${it.transform[5].toFixed(0)} x=${it.transform[4].toFixed(0)} w=${(it.width||0).toFixed(0)} ${JSON.stringify(it.str.slice(0,45))}`))
