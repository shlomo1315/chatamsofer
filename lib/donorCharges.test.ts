import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { aidsAsReceipts, chargesFileName, chargesSheets, groupCharges, selectionDays, israelDateTime, parseDateSelection, selectionLabel, toCharges } from './donorCharges'
import { buildXlsx } from './xlsx'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1', home: 'בית א', amount: 500, nights: 2, note: 'שתי לילות', is_initial: true,
  created_at: '2026-11-10T08:30:00Z',
  aid: { status: 'active', recovery_home: 'בית א', beneficiary: { full_name: 'שרה', family_name: 'כהן', spouse_name: 'משה', id_number: '012345678' } },
  ...over,
})

describe('parseDateSelection', () => {
  it('תאריכים בודדים: מנקה, מסיר כפילויות וממיין', () => {
    expect(parseDateSelection({ dates: '2026-11-03,bad,2026-11-01,2026-11-03' })).toEqual({ dates: ['2026-11-01', '2026-11-03'] })
  })
  it('טווח תקין, ודחייה של טווח הפוך, ארוך משנה או חסר', () => {
    expect(parseDateSelection({ from: '2026-11-01', to: '2026-11-07' })).toEqual({ from: '2026-11-01', to: '2026-11-07' })
    expect(parseDateSelection({ from: '2026-11-07', to: '2026-11-01' })).toBeNull()
    expect(parseDateSelection({ from: '2024-01-01', to: '2026-01-01' })).toBeNull()
    expect(parseDateSelection({ from: '2026-11-01' })).toBeNull()
    expect(parseDateSelection({})).toBeNull()
  })
  it('יותר מ-62 תאריכים נדחה', () => {
    const many = Array.from({ length: 63 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)).join(',')
    expect(parseDateSelection({ dates: many })).toBeNull()
  })
})

describe('israelDateTime', () => {
  it('ממיר לשעון ישראל, כולל מעבר יום', () => {
    expect(israelDateTime('2026-11-10T22:30:00Z')).toEqual({ date: '2026-11-11', time: '00:30' })
    expect(israelDateTime('2026-07-10T20:59:00Z')).toEqual({ date: '2026-07-10', time: '23:59' })
    expect(israelDateTime('x')).toBeNull()
  })
})

describe('toCharges', () => {
  const sel = { from: '2026-11-10', to: '2026-11-11' }
  it('ממיר שורה וחושף רק 4 ספרות של ת״ז', () => {
    const [c] = toCharges([row()], sel, null)
    expect(c).toMatchObject({ date: '2026-11-10', time: '10:30', home: 'בית א', name: 'כהן שרה', idLast4: '5678', amount: 500, nights: 2, initial: true })
    expect(JSON.stringify(c)).not.toContain('012345678')
  })
  it('מסנן יולדת שלא אושרה, סכום אפס ותאריך מחוץ לבחירה', () => {
    const rows = [
      row({ id: 'a', aid: { ...row().aid, status: 'pending' } }),
      row({ id: 'b', amount: 0 }),
      row({ id: 'c', created_at: '2026-11-12T10:00:00Z' }),
      row({ id: 'd' }),
    ]
    expect(toCharges(rows, sel, null).map(c => c.id)).toEqual(['d'])
  })
  it('קישור נעול רואה רק את הסניף שלו; סניף ריק נלקח מהיולדת', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', home: 'בית ב' }), row({ id: 'c', home: '', aid: { ...row().aid, recovery_home: 'בית ב' } })]
    expect(toCharges(rows, sel, 'בית ב').map(c => c.id)).toEqual(['b', 'c'])
  })
  it('בחירת תאריכים בודדים מדלגת על הימים שביניהם', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', created_at: '2026-11-11T08:00:00Z' }), row({ id: 'c', created_at: '2026-11-12T08:00:00Z' })]
    expect(toCharges(rows, { dates: ['2026-11-10', '2026-11-12'] }, null).map(c => c.id)).toEqual(['a', 'c'])
  })
})

describe('groupCharges ו-chargesSheets', () => {
  const charges = toCharges([
    row({ id: 'a', amount: 500 }),
    row({ id: 'b', amount: 300, is_initial: false, created_at: '2026-11-10T12:00:00Z' }),
    row({ id: 'c', amount: 200, created_at: '2026-11-11T09:00:00Z' }),
    row({ id: 'd', home: 'בית ב', amount: 700 }),
  ], { from: '2026-11-10', to: '2026-11-11' }, null)
  const report = groupCharges(charges)

  it('סכום יומי לכל סניף בנפרד, והכול מסתכם', () => {
    expect(report.count).toBe(4)
    expect(report.amount).toBe(1700)
    expect(report.branches.map(b => [b.home, b.amount, b.days.map(d => [d.date, d.count, d.amount])])).toEqual([
      ['בית א', 1000, [['2026-11-10', 2, 800], ['2026-11-11', 1, 200]]],
      ['בית ב', 700, [['2026-11-10', 1, 700]]],
    ])
  })

  it('תווית הבחירה', () => {
    expect(selectionLabel({ from: '2026-11-10', to: '2026-11-11' })).toBe('10.11.2026 עד 11.11.2026')
    expect(selectionLabel({ dates: ['2026-11-10', '2026-11-12'] })).toBe('10.11.2026, 12.11.2026')
  })

  it('ימי הבחירה ושם הקובץ', () => {
    expect(selectionDays({ from: '2026-10-30', to: '2026-11-02' })).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(selectionDays({ dates: ['2026-11-10', '2026-11-12'] })).toEqual(['2026-11-10', '2026-11-12'])
    expect(chargesFileName({ from: '2026-11-17', to: '2026-11-23' })).toBe('דוח-חיובים_17.11-23.11.2026')
    expect(chargesFileName({ dates: ['2026-11-19'] })).toBe('דוח-חיובים_19.11.2026')
    expect(chargesFileName({ from: '2025-12-30', to: '2026-01-02' })).toBe('דוח-חיובים_30.12.2025-02.01.2026')
  })

  it('קובץ האקסל: סיכום יום × סניף וגיליון לכל סניף, RTL, עם שורות סה״כ מודגשות', async () => {
    const sheets = chargesSheets(report, ['2026-11-10', '2026-11-11', '2026-11-12'])
    expect(sheets.map(s => s.name)).toEqual(['סיכום', 'בית א', 'בית ב'])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await buildXlsx(sheets) as unknown as ArrayBuffer)
    const sum = wb.getWorksheet('סיכום')!
    expect(sum.views[0]?.rightToLeft).toBe(true)
    expect(sum.getRow(1).values).toEqual([, 'תאריך', 'בית א', 'בית ב', 'סה״כ ליום'])
    expect([2, 3, 4].map(r => [2, 3, 4].map(c => sum.getRow(r).getCell(c).value))).toEqual([[800, 700, 1500], [200, 0, 200], [0, 0, 0]])
    const last = sum.getRow(sum.rowCount)
    expect([1, 2, 3, 4].map(c => last.getCell(c).value)).toEqual(['סה״כ', 1000, 700, 1700])
    expect(last.getCell(1).font?.bold).toBe(true)
    expect(sum.getRow(2).getCell(1).font?.bold).toBeFalsy()

    const a = wb.getWorksheet('בית א')!
    expect(a.getRow(1).values).toEqual([, 'תאריך', 'שם היולדת', 'לילות', 'סכום (₪)', 'סה״כ ליום (₪)'])
    // שני חיובים ב-10.11: הסה״כ היומי רק בשורה האחרונה של היום
    expect([2, 3, 4].map(r => [a.getRow(r).getCell(4).value, a.getRow(r).getCell(5).value])).toEqual([[500, null], [300, 800], [200, 200]])
    const total = a.getRow(a.rowCount)
    expect([total.getCell(1).value, total.getCell(5).value]).toEqual(['סה״כ בית א', 1000])
    expect(total.getCell(1).font?.bold).toBe(true)
    expect(JSON.stringify(sheets)).not.toContain('5678')
  })
})

describe('aidsAsReceipts', () => {
  it('יולדת עם חיוב שבוצע ובלי קבלות נכנסת כחיוב אחד; עם קבלות לא נספרת פעמיים', () => {
    const aid = (id: string) => ({
      id, status: 'active', recovery_home: 'בית א', recovery_amount: 220, recovery_nights: 1,
      recovery_amount_at: '2026-08-20T09:00:00Z', beneficiary: row().aid.beneficiary,
    })
    const rows = aidsAsReceipts([aid('1'), aid('2')], new Set(['2']))
    expect(rows.map(r => r.id)).toEqual(['aid-1'])
    const [c] = toCharges(rows, { from: '2026-08-16', to: '2026-09-18' }, null)
    expect(c).toMatchObject({ id: 'aid-1', date: '2026-08-20', home: 'בית א', amount: 220, initial: true })
  })
})
