import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { buildKvitelPdf } from './kvitelPdf'
import { buildKvitelDocx } from './kvitelDocx'
import { hebrewPageNumber } from './kvitelDocLayout'

describe('buildKvitelPdf', () => {
  it('מייצר PDF תקין עם לוגו ועמודים מרובים', async () => {
    const logoPng = readFileSync('public/logo-heichal-bw.png')
    const lines = Array.from({ length: 80 }, (_, i) => `ישראל בן שרה (${i + 1}) לרפואה שלמה`)
    const bytes = await buildKvitelPdf({ lines, date: new Date('2026-11-05'), logoPng })
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
    const withoutLogo = await buildKvitelPdf({ lines, date: new Date('2026-11-05') })
    expect(bytes.length).toBeGreaterThan(withoutLogo.length)
  })

  // 185 בקשות (כמו בסגירת המנה, 19.11.2026): כותרת בראש כל עמוד, מספור א-ב בתחתית, ושום שם לא נחתך
  it('185 בקשות: כל עמוד A4 עם כותרת ומספור עברי, והשמות בתוך השוליים', async () => {
    const logoPng = readFileSync('public/logo-heichal-bw.png')
    const lines = Array.from({ length: 185 }, (_, i) => `ישראל בן שרה (${i + 1}) לרפואה שלמה`)
    const bytes = await buildKvitelPdf({ lines, date: new Date('2026-11-19'), logoPng })
    if (process.env.KVITEL_PDF_OUT) writeFileSync(process.env.KVITEL_PDF_OUT, bytes)

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise
    expect(doc.numPages).toBeGreaterThan(5)

    let names = 0
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const [, , w, h] = page.view
      expect(Math.round(w)).toBe(595)
      expect(Math.round(h)).toBe(842)
      const items = (await page.getTextContent()).items
        .filter((it): it is { str: string; transform: number[]; width: number; height: number } => 'str' in it && !!it.str.trim())

      // מספור: במרכז התחתית, באותיות (טו/טז ולא יה/יו)
      const footer = items.filter(it => it.transform[5] < 50)
      expect(footer.map(it => it.str)).toEqual([hebrewPageNumber(n)])
      expect(Math.abs(footer[0].transform[4] + footer[0].width / 2 - w / 2)).toBeLessThan(2)

      // כותרת: בעמוד הראשון המלאה (עם הלוגו), בשאר — המקוצרת בראש העמוד
      // (pdfjs מחזיר את הטקסט בסדר לוגי)
      const top = items.filter(it => it.transform[5] > h - 130).map(it => it.str).join(' ')
      expect(top).toContain('בעל החתם סופר')

      for (const it of items.filter(it => it.transform[5] >= 50)) {
        // השמות לא חורגים מהשוליים (למטה מעל המספור, ומהצדדים בתוך 50 נק')
        expect(it.transform[5]).toBeGreaterThanOrEqual(72)
        expect(it.transform[4]).toBeGreaterThanOrEqual(49)
        expect(it.transform[4] + it.width).toBeLessThanOrEqual(w - 49)
        if (it.str.includes('לרפואה שלמה')) names++
      }
    }
    expect(names).toBe(185)
  })
})

describe('hebrewPageNumber', () => {
  it('א, ב ... י, יא ... טו, טז ... כ, כא', () => {
    expect([1, 2, 10, 11, 15, 16, 20, 21, 100].map(hebrewPageNumber))
      .toEqual(['א', 'ב', 'י', 'יא', 'טו', 'טז', 'כ', 'כא', 'ק'])
  })
})

describe('buildKvitelDocx', () => {
  it('כותרת קבועה מהעמוד השני, מספור עברי בתחתית ושוליים נוחים', async () => {
    const bytes = await buildKvitelDocx({ lines: ['ישראל בן שרה'], date: new Date('2026-11-19'), logoPng: readFileSync('public/logo-heichal-bw.png') })
    const zip = await JSZip.loadAsync(bytes)
    const doc = await zip.file('word/document.xml')!.async('string')
    expect(doc).toMatch(/<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"\/><w:headerReference w:type="first" r:id="rIdHdrFirst"\/><w:footerReference w:type="default" r:id="rIdFtr"\/><w:footerReference w:type="first" r:id="rIdFtr"\/><w:pgSz [^>]*\/><w:pgMar [^>]*\/><w:pgNumType w:fmt="hebrew1" w:start="1"\/><w:titlePg\/><w:bidi\/><\/w:sectPr>/)
    expect(await zip.file('word/header1.xml')!.async('string')).toContain('בעל החתם סופר')
    expect(await zip.file('word/header2.xml')!.async('string')).not.toContain('חתם')
    expect(await zip.file('word/footer1.xml')!.async('string')).toContain(' PAGE ')
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    const types = await zip.file('[Content_Types].xml')!.async('string')
    for (const part of ['header1.xml', 'header2.xml', 'footer1.xml']) {
      expect(rels).toContain(`Target="${part}"`)
      expect(types).toContain(`PartName="/word/${part}"`)
    }
  })
})
