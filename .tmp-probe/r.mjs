import { readFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
const data = new Uint8Array(readFileSync('קטלוג היכל החתם סופר.pdf'))
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
const page = await doc.getPage(4)
const rvp = page.getViewport({ scale: 1.5 })
console.log('viewport', rvp.width.toFixed(0), rvp.height.toFixed(0))
const c = createCanvas(Math.ceil(rvp.width), Math.ceil(rvp.height))
const ctx = c.getContext('2d')
console.log('canvas ready')
await page.render({ canvasContext: ctx, viewport: rvp }).promise
console.log('rendered ok')
writeFileSync?.length
const { writeFileSync } = await import('node:fs')
writeFileSync('.tmp-probe/page4.png', c.toBuffer('image/png'))
console.log('saved')
