const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const { readFileSync } = await import('node:fs')
const data = new Uint8Array(readFileSync('קטלוג היכל החתם סופר.pdf'))
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
console.log('pages:', doc.numPages)
const page = await doc.getPage(3)
const vp = page.getViewport({ scale: 1 })
console.log('page3:', vp.width.toFixed(1), 'x', vp.height.toFixed(1))
const tc = await page.getTextContent()
const skus = []
for (const it of tc.items) {
  const s = (it.str||'').trim()
  if (/^\d{4}$/.test(s)) skus.push({ s, x:+it.transform[4].toFixed(1), y:+it.transform[5].toFixed(1) })
}
console.log('4-digit items:', skus.length)
skus.sort((a,b)=> b.y-a.y || b.x-a.x)
skus.forEach(k => console.log('  ', k.s, 'x='+k.x, 'y='+k.y))
