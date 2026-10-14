import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { cleanName, normalizePhone, validateLines, formatLine, personKey } from './kvitel'
import { buildKvitelDocx, shabbatLabel } from './kvitelDocx'
import { applyKvitelFilters, parseKvitelFilters, type KvitelRequestRow } from './kvitelQuery'

describe('kvitel', () => {
  it('cleanName מסיר ניקוד, סימנים ורווחים כפולים', () => {
    expect(cleanName('  פֶּעשָׁא   לאה! ')).toBe('פעשא לאה')
    expect(cleanName('<script>')).toBe('script')
  })

  it('normalizePhone', () => {
    expect(normalizePhone('050-123-4567')).toBe('0501234567')
    expect(normalizePhone('+972 50 1234567')).toBe('0501234567')
    expect(normalizePhone('12345')).toBeNull()
  })

  it('validateLines דוחה שורה חסרה ומקבל תקינה', () => {
    expect(validateLines([])).toMatchObject({ ok: false })
    expect(validateLines([{ name: 'מאיר', relation: 'ben', parentName: '', requestType: 'refua' }]))
      .toEqual({ ok: false, error: 'שורה 1: חסר שם האם' })
    expect(validateLines([{ name: 'שרה', relation: 'bat', parentName: 'רחל', requestType: 'other' }]))
      .toEqual({ ok: false, error: 'שורה 1: יש לכתוב את הבקשה' })
    const r = validateLines([{ name: 'מאיר', relation: 'ben', parentName: 'פעשא לאה', requestType: 'refua', requestNote: 'x' }])
    expect(r).toEqual({ ok: true, lines: [{ name: 'מאיר', relation: 'ben', parentName: 'פעשא לאה', requestType: 'refua', requestNote: null }] })
  })

  it('formatLine בצורת הקוויטל', () => {
    expect(formatLine({ name: 'מאיר', relation: 'ben', parentName: 'פעשא לאה', requestType: 'refua' }))
      .toBe('מאיר בן פעשא לאה - לרפואה שלימה')
    expect(formatLine({ name: 'שרה', relation: 'bat', parentName: 'רחל', requestType: 'other', requestNote: 'לבריאות' }))
      .toBe('שרה בת רחל - לבריאות')
  })

  it('personKey מתעלם מרווחים וגרשים', () => {
    expect(personKey({ name: 'פעשא לאה', relation: 'bat', parentName: 'רחל' }))
      .toBe(personKey({ name: 'פעשאלאה', relation: 'bat', parentName: 'רחל' }))
  })
})

describe('kvitelDocx', () => {
  it('shabbatLabel — פרשה ושנה בלי ניקוד', () => {
    expect(shabbatLabel(new Date('2026-10-14T12:00:00Z'))).toBe('ערש"ק פרשת נח תשפ"ז')
  })

  it('buildKvitelDocx מייצר docx עם השורות, בבריחת XML', async () => {
    const bytes = await buildKvitelDocx({ lines: ['מאיר בן פעשא לאה - לרפואה שלימה', 'א & ב'], date: new Date('2026-10-14') })
    const zip = await JSZip.loadAsync(bytes)
    const doc = await zip.file('word/document.xml')!.async('string')
    expect(doc).toContain('מאיר בן פעשא לאה - לרפואה שלימה')
    expect(doc).toContain('א &amp; ב')
    expect(doc).toContain('קויטל לציון רבינו הקדוש')
    expect(zip.file('[Content_Types].xml')).toBeTruthy()
    expect(zip.file('word/media/logo.png')).toBeNull()
  })
})

describe('kvitelQuery', () => {
  const row = (over: Partial<KvitelRequestRow>): KvitelRequestRow => ({
    id: 'r', channel: 'web', status: 'pending', contact_name: 'משה כהן', contact_phone: '0501234567', contact_email: null,
    raw_text: null, note: null, submitted_at: '2026-10-13T22:30:00Z', done_at: null,
    kvitel_request_lines: [
      { id: 'b', position: 1, name: 'שרה', relation: 'bat', parent_name: 'רחל', request_type: 'zivug', request_note: null, flagged: false, flag_reason: null },
      { id: 'a', position: 0, name: 'מאיר', relation: 'ben', parent_name: 'פעשא לאה', request_type: 'refua', request_note: null, flagged: false, flag_reason: null },
    ],
    ...over,
  })

  it('parseKvitelFilters — ברירות מחדל ודחיית ערכים זרים', () => {
    expect(parseKvitelFilters({ status: 'x', channel: 'fax', type: 'bad', from: '2026-1-1' }))
      .toEqual({ from: null, to: null, status: 'open', channel: null, type: null, q: '' })
    expect(parseKvitelFilters({ status: 'done', channel: 'phone', type: 'refua', from: '2026-10-01' }))
      .toMatchObject({ status: 'done', channel: 'phone', type: 'refua', from: '2026-10-01' })
  })

  it('applyKvitelFilters — יום לפי שעון ישראל, סוג בקשה וחיפוש', () => {
    // 22:30 UTC ב-13.10 = 01:30 ב-14.10 בישראל
    expect(applyKvitelFilters([row({})], parseKvitelFilters({ from: '2026-10-14', to: '2026-10-14' }))).toHaveLength(1)
    expect(applyKvitelFilters([row({})], parseKvitelFilters({ to: '2026-10-13' }))).toHaveLength(0)
    const byType = applyKvitelFilters([row({})], parseKvitelFilters({ type: 'zivug' }))
    expect(byType[0].kvitel_request_lines.map(l => l.name)).toEqual(['שרה'])
    expect(applyKvitelFilters([row({})], parseKvitelFilters({}))[0].kvitel_request_lines.map(l => l.name)).toEqual(['מאיר', 'שרה'])
    expect(applyKvitelFilters([row({})], parseKvitelFilters({ q: 'פעשא' }))[0].kvitel_request_lines).toHaveLength(1)
    expect(applyKvitelFilters([row({})], parseKvitelFilters({ q: '050-123' }))[0].kvitel_request_lines).toHaveLength(2)
    expect(applyKvitelFilters([row({})], parseKvitelFilters({ q: 'יעקב' }))).toHaveLength(0)
  })
})
