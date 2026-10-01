const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const { readFileSync } = await import('node:fs')
const data = new Uint8Array(readFileSync('קטלוג היכל החתם סופר.pdf'))
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
let total = 0
for (let pn = 1; pn <= doc.numPages; pn++) {
  const page = await doc.getPage(pn)
  const tc = await page.getTextContent()
  const hits = []
  for (const it of tc.items) {
    const compact = (it.str||'').replace(/\s+/g,'')
    if (/^0[1-9]\d{2}$/.test(compact)) {
      hits.push({ sku: compact, x:+it.transform[4].toFixed(0), y:+it.transform[5].toFixed(0) })
    }
  }
  if (!hits.length) continue
  total += hits.length
  hits.sort((a,b)=> b.y-a.y || b.x-a.x)
  console.log(`page ${pn}: ${hits.length} skus`)
  if (pn <= 7) hits.forEach(h => console.log(`   ${h.sku}  x=${h.x} y=${h.y}`))
}
console.log('TOTAL skus in product pages:', total)
