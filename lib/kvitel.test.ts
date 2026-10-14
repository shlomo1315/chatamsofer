import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { cleanName, normalizePhone, validateLines, formatLine, personKey } from './kvitel'
import { buildKvitelDocx, buildKvitelDocumentXml, shabbatLabel } from './kvitelDocx'
import { applyKvitelFilters, kvitelExportLines, parseKvitelFilters, type KvitelRequestRow } from './kvitelQuery'

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
    expect(validateLines([{ name: 'שרה', relation: 'bat', parentName: 'רחל', requestType: '' }]))
      .toEqual({ ok: false, error: 'שורה 1: נא לבחור את סוג הבקשה' })
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

  it('סדר התגיות לפי סכמת Word — אחרת Word פוסל את הקובץ כפגום', () => {
    const doc = buildKvitelDocumentXml({ lines: ['א בן ב - לרפואה שלימה'], date: new Date('2026-10-14'), logoPng: new Uint8Array([1]) })
    // pPr: pBdr לפני bidi, bidi לפני spacing, spacing לפני jc
    for (const m of doc.matchAll(/<w:pPr>(.*?)<\/w:pPr>/g)) {
      const order = ['<w:pBdr', '<w:bidi/>', '<w:spacing', '<w:jc'].map(t => m[1].indexOf(t)).filter(i => i >= 0)
      expect(order).toEqual([...order].sort((a, b) => a - b))
    }
    // rPr: rFonts, b, i, sz, u, rtl
    for (const m of doc.matchAll(/<w:rPr>(.*?)<\/w:rPr>/g)) {
      const order = ['<w:rFonts', '<w:b/>', '<w:i/>', '<w:sz ', '<w:u ', '<w:rtl/>'].map(t => m[1].indexOf(t)).filter(i => i >= 0)
      expect(order).toEqual([...order].sort((a, b) => a - b))
    }
  })
})

describe('kvitelQuery', () => {
  const row = (over: Partial<KvitelRequestRow>): KvitelRequestRow => ({
    id: 'r', channel: 'web', status: 'pending', contact_name: 'משה כהן', contact_phone: '0501234567', contact_email: null,
    raw_text: null, recording_url: null, note: null, submitted_at: '2026-10-13T22:30:00Z', done_at: null,
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

  it('applyKvitelFilters — בקשה בלי שורות (לא פוענחה) נשארת, אבל לא בסינון לפי סוג', () => {
    expect(applyKvitelFilters([row({ kvitel_request_lines: [] })], parseKvitelFilters({}))).toHaveLength(1)
    expect(applyKvitelFilters([row({ kvitel_request_lines: [] })], parseKvitelFilters({ type: 'refua' }))).toHaveLength(0)
  })

  it('kvitelExportLines — כל הערוצים בקובץ אחד, בסדר קבוע, בלי "לבדיקה" ו"בוטל"', () => {
    const line = (id: string, name: string, position = 0) => ({ id, position, name, relation: 'ben', parent_name: 'רחל', request_type: 'refua', request_note: null, flagged: false, flag_reason: null })
    const rows = [
      row({ id: 'r3', channel: 'phone', submitted_at: '2026-10-14T09:00:00Z', kvitel_request_lines: [line('x', 'ג')] }),
      row({ id: 'r2', channel: 'email', submitted_at: '2026-10-14T08:00:00Z', kvitel_request_lines: [line('y', 'ב')] }),
      row({ id: 'r1', channel: 'nedarim', submitted_at: '2026-10-14T08:00:00Z', kvitel_request_lines: [line('z2', 'א2', 1), line('z1', 'א1', 0)] }),
      row({ id: 'r0', status: 'review', submitted_at: '2026-10-13T08:00:00Z', kvitel_request_lines: [line('w', 'לבדיקה')] }),
      row({ id: 'r9', status: 'cancelled', submitted_at: '2026-10-13T08:00:00Z', kvitel_request_lines: [line('v', 'בוטל')] }),
    ]
    const names = ['א1 בן רחל - לרפואה שלימה', 'א2 בן רחל - לרפואה שלימה', 'ב בן רחל - לרפואה שלימה', 'ג בן רחל - לרפואה שלימה']
    expect(kvitelExportLines(rows)).toEqual(names)
    expect(kvitelExportLines([...rows].reverse())).toEqual(names)
    expect(kvitelExportLines(rows, new Set(['r2', 'r0']))).toEqual(['ב בן רחל - לרפואה שלימה'])
  })
})

describe('kvitelDocLayout', () => {
  it('הקובץ נכתב מאותו מבנה שהתצוגה המקדימה מציגה', async () => {
    const { kvitelDocLayout } = await import('./kvitelDocLayout')
    const date = new Date('2026-10-14')
    const lines = ['א בן ב - לרפואה שלימה', 'ג בת ד']
    const layout = kvitelDocLayout(lines, date)
    const xml = buildKvitelDocumentXml({ lines, date })
    for (const p of [...layout.titles, ...layout.body]) {
      if (p.run) expect(xml).toContain(p.run.text.replace(/"/g, '&quot;'))
    }
    expect(layout.body.filter(p => p.run?.size === 26).map(p => p.run!.text)).toEqual(lines)
  })
})
