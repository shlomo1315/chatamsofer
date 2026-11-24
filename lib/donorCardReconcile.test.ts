import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { DonorCharge } from './donorCharges'
import { CardFileError, extractCardRows, parseCardDate, parseCardFile, parseMoney, reconcile, type FileRow } from './donorCardReconcile'

const charge = (id: string, date: string, amount: number, home = 'בית החלמה רמת גן'): DonorCharge => ({
  id, date, time: '10:00', home, name: 'כהן שרה', idLast4: '1234', amount, nights: 3, note: null, initial: true,
})
const row = (date: string, amount: number, merchant = 'בית החלמה רמת גן', line = 1): FileRow => ({ line, date, amount, merchant, ref: '' })
const ab = (b: Uint8Array | Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

describe('פענוח תאריך וסכום', () => {
  it('תאריכים בפורמטים הנפוצים', () => {
    expect(parseCardDate('19/11/2026')).toBe('2026-11-19')
    expect(parseCardDate('19.11.26')).toBe('2026-11-19')
    expect(parseCardDate('2026-11-19')).toBe('2026-11-19')
    expect(parseCardDate('31/02/2026')).toBeNull()
    expect(parseCardDate('בית עסק')).toBeNull()
  })
  it('סכומים עם ₪, פסיקים ומינוס', () => {
    expect(parseMoney('₪ 1,900.50')).toBe(1900.5)
    expect(parseMoney('2,000 ש"ח')).toBe(2000)
    expect(parseMoney('150-')).toBe(-150)
    expect(parseMoney('אסמכתא')).toBeNull()
  })
})

describe('reconcile', () => {
  it('שורה תואמת: אותו תאריך ואותו סכום', () => {
    const r = reconcile([row('2026-11-19', 2000)], [charge('a', '2026-11-19', 2000)])
    expect(r.rows[0]).toMatchObject({ status: 'ok', chargeId: 'a', why: '' })
    expect(r.missing).toEqual([])
  })

  it('שורה בלי חיוב: לא נמצא, עם הסבר שמזכיר את הסניף', () => {
    const r = reconcile([row('2026-11-19', 1900)], [charge('a', '2026-11-12', 500)])
    expect(r.rows[0].status).toBe('none')
    expect(r.rows[0].chargeId).toBeNull()
    expect(r.rows[0].why).toBe('אין חיוב בבית החלמה רמת גן ב-19.11 על ₪1,900')
  })

  it('פער תאריך ופער סכום', () => {
    const r = reconcile(
      [row('2026-11-20', 2000, 'x', 1), row('2026-11-19', 2050, 'x', 2)],
      [charge('a', '2026-11-19', 2000), charge('b', '2026-11-19', 2000)],
    )
    expect(r.rows[0]).toMatchObject({ status: 'diff', why: 'תאריך: 20.11 בקובץ, 19.11 במערכת' })
    expect(r.rows[1]).toMatchObject({ status: 'diff', why: 'סכום: ₪2,050 בקובץ, ₪2,000 במערכת' })
    expect(new Set([r.rows[0].chargeId, r.rows[1].chargeId])).toEqual(new Set(['a', 'b']))
  })

  it('חיוב בטווח הקובץ בלי שורה: לא בקובץ. חיוב מחוץ לטווח לא נחשב', () => {
    const r = reconcile([row('2026-11-18', 100), row('2026-11-20', 200)],
      [charge('a', '2026-11-18', 100), charge('b', '2026-11-19', 700), charge('c', '2026-11-25', 300)])
    expect(r.missing).toEqual(['b'])
    expect(r.range).toEqual({ from: '2026-11-18', to: '2026-11-20' })
  })

  it('בית עסק שמזכיר סניף מחפש רק בסניף הזה, וכל חיוב משויך פעם אחת', () => {
    const r = reconcile(
      [row('2026-11-19', 2000, 'בית החלמה "בני ברק" בע"מ', 1), row('2026-11-19', 2000, 'בית החלמה בני ברק', 2)],
      [charge('rg', '2026-11-19', 2000), charge('bb', '2026-11-19', 2000, 'בית החלמה בני ברק')],
    )
    expect(r.rows[0]).toMatchObject({ status: 'ok', chargeId: 'bb' })
    expect(r.rows[1].status).toBe('none')
  })
})

describe('זיהוי עמודות', () => {
  it('לפי כותרות, עם עדיפות לתאריך עסקה ולסכום חיוב, והסתרת מספרים ארוכים', () => {
    const { columns, rows } = extractCardRows([
      ['פירוט עסקאות לכרטיס 1234'],
      ['תאריך חיוב', 'תאריך עסקה', 'שם בית העסק', 'סכום עסקה', 'סכום חיוב', 'מס׳ שובר'],
      ['02/12/2026', '19/11/2026', 'בית החלמה רמת גן 123456789', '2,100', '2,000.00', '12345678'],
      ['', '', 'סה״כ', '', '2,000.00', ''],
    ])
    expect(columns).toEqual({ date: 'תאריך עסקה', amount: 'סכום חיוב', merchant: 'שם בית העסק', ref: 'מס׳ שובר' })
    expect(rows).toEqual([{ line: 3, date: '2026-11-19', amount: 2000, merchant: 'בית החלמה רמת גן •••', ref: '12345678' }])
  })

  it('בלי כותרות: זיהוי לפי התוכן, בלי אסמכתא', () => {
    const { rows } = extractCardRows([['19.11.26', 'בית החלמה רמת גן', '98765432', '1,900']])
    expect(rows).toEqual([{ line: 1, date: '2026-11-19', amount: 1900, merchant: 'בית החלמה רמת גן', ref: '' }])
  })
})

describe('parseCardFile', () => {
  it('קובץ לא תקין: שגיאה ברורה', async () => {
    await expect(parseCardFile(ab(Buffer.from('שלום, זה לא קובץ אשראי\nבכלל')), 'x.csv')).rejects.toBeInstanceOf(CardFileError)
    await expect(parseCardFile(ab(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3, 4])), 'x.xls')).rejects.toThrow(/xlsx או CSV/)
    await expect(parseCardFile(ab(Buffer.from('PK\u0003\u0004garbage')), 'x.xlsx')).rejects.toThrow(/פגום/)
    await expect(parseCardFile(ab(Buffer.from('%PDF-1.4 garbage')), 'x.pdf')).rejects.toThrow(/פגום/)
    await expect(parseCardFile(new ArrayBuffer(0), 'x.csv')).rejects.toThrow(/ריק/)
  })

  it('csv בקידוד חלונות עברי', async () => {
    const text = 'תאריך,בית עסק,סכום\n19/11/2026,רמת גן,"1,900"\n'
    // קידוד windows-1255 ידני: אותיות עבריות 0x05D0-0x05EA ← 0xE0-0xFA
    const bytes = Uint8Array.from([...text].map(ch => { const c = ch.charCodeAt(0); return c >= 0x5d0 && c <= 0x5ea ? c - 0x5d0 + 0xe0 : c }))
    const { rows } = await parseCardFile(ab(bytes), 'x.csv')
    expect(rows).toEqual([{ line: 2, date: '2026-11-19', amount: 1900, merchant: 'רמת גן', ref: '' }])
  })

  it('xls שהוא טבלת HTML', async () => {
    const html = '<table><tr><th>תאריך עסקה</th><th>שם בית עסק</th><th>סכום&nbsp;חיוב</th></tr><tr><td>19/11/2026</td><td>רמת&amp;גן</td><td>1,900.00</td></tr></table>'
    const { rows } = await parseCardFile(ab(Buffer.from(html)), 'x.xls')
    expect(rows).toEqual([{ line: 2, date: '2026-11-19', amount: 1900, merchant: 'רמת&גן', ref: '' }])
  })

  it('xlsx עם תא תאריך אמיתי ונוסחה', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('עסקאות')
    ws.addRow(['תאריך עסקה', 'שם בית העסק', 'סכום חיוב', 'אסמכתא'])
    ws.addRow([new Date(Date.UTC(2026, 10, 19)), 'בית החלמה רמת גן', 2000, '445566'])
    ws.addRow([new Date(Date.UTC(2026, 10, 20)), 'בית החלמה רמת גן', { formula: '1000+900', result: 1900 }, ''])
    const buf = await wb.xlsx.writeBuffer()
    const { rows } = await parseCardFile(ab(new Uint8Array(buf as ArrayBuffer)), 'card.xlsx')
    expect(rows).toEqual([
      { line: 2, date: '2026-11-19', amount: 2000, merchant: 'בית החלמה רמת גן', ref: '445566' },
      { line: 3, date: '2026-11-20', amount: 1900, merchant: 'בית החלמה רמת גן', ref: '' },
    ])
  })

  it('PDF של פירוט אשראי: שורות ועמודות לפי מיקום הטקסט', async () => {
    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)
    const font = await pdf.embedFont(readFileSync('public/fonts/Heebo.ttf'))
    const page = pdf.addPage([595, 842])
    // כמו בקבצי חברות האשראי: העברית כתובה בסדר חזותי, מימין לשמאל
    const vis = (s: string) => [...s].reverse().join('')
    const put = (s: string, right: number, y: number) => page.drawText(s, { x: right - font.widthOfTextAtSize(s, 10), y, size: 10, font })
    const lines = [['תאריך', 'שם בית עסק', 'סכום'].map(vis), ['19/11/2026', vis('בית החלמה רמת גן'), '2,000.00'], ['20/11/2026', vis('בני ברק'), '1,900.00']]
    lines.forEach((cells, i) => cells.forEach((c, j) => put(c, 560 - j * 180, 780 - i * 20)))
    const bytes = await pdf.save()
    const { rows } = await parseCardFile(ab(bytes), 'card.pdf')
    expect(rows.map(r => [r.date, r.amount])).toEqual([['2026-11-19', 2000], ['2026-11-20', 1900]])
    expect(rows.map(r => r.merchant)).toEqual(['בית החלמה רמת גן', 'בני ברק'])
  })
})
