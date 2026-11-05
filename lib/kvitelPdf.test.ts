import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { buildKvitelPdf } from './kvitelPdf'

describe('buildKvitelPdf', () => {
  it('מייצר PDF תקין עם לוגו ועמודים מרובים', async () => {
    const logoPng = readFileSync('public/logo-heichal-bw.png')
    const lines = Array.from({ length: 80 }, (_, i) => `ישראל בן שרה (${i + 1}) לרפואה שלמה`)
    const bytes = await buildKvitelPdf({ lines, date: new Date('2026-11-05'), logoPng })
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
    const withoutLogo = await buildKvitelPdf({ lines, date: new Date('2026-11-05') })
    expect(bytes.length).toBeGreaterThan(withoutLogo.length)
    if (process.env.KVITEL_PDF_OUT) writeFileSync(process.env.KVITEL_PDF_OUT, bytes)
  })
})
