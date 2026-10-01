const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const { readFileSync } = await import('node:fs')
const data = new Uint8Array(readFileSync('קטלוג היכל החתם סופר.pdf'))
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
for (const pn of [3]) {
  const page = await doc.getPage(pn)
  const tc = await page.getTextContent()
  console.log(`--- page ${pn}: ${tc.items.length} items ---`)
  tc.items.slice(0, 45).forEach(it => {
    const s = (it.str||'')
    if (!s.trim()) return
    console.log(`  y=${it.transform[5].toFixed(0)} x=${it.transform[4].toFixed(0)} ${JSON.stringify(s)}`)
  })
}
