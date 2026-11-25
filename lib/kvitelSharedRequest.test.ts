import { describe, it, expect } from 'vitest'
import { applySharedRequests, formatRequestLines, SAME_AS_ABOVE } from './kvitel'
import { kvitelRequestLines } from './kvitelQuery'
import { decodeFromSaved } from './kvitelMailDecode'

// כלל 7 המילים: בקשה משותפת נשמרת במלואה אצל כל שם. בתצוגה ובקובץ — עד 7 מילים מלאה אצל כולם,
// מעל 7 מלאה אצל הראשון ו"הנ"ל" אצל השאר.

const SEVEN = 'שיזכה לראות נחת מכל צאצאיו בבריאות טובה'
const EIGHT = `${SEVEN} ושמחה`
const line = (name: string, note: string, requestType = 'other') =>
  ({ name, relation: 'ben', parentName: 'שרה', requestType, requestNote: note })

describe('כלל 7 המילים', () => {
  it('7 מילים: הבקשה מלאה אצל כל השמות', () => {
    expect(formatRequestLines([line('משה', SEVEN), line('יוסף', SEVEN), line('דוד', SEVEN)])).toEqual([
      `משה בן שרה - ${SEVEN}`, `יוסף בן שרה - ${SEVEN}`, `דוד בן שרה - ${SEVEN}`,
    ])
  })

  it('8 מילים: מלאה אצל הראשון, "הנ"ל" אצל השאר', () => {
    expect(formatRequestLines([line('משה', EIGHT), line('יוסף', EIGHT), line('דוד', EIGHT)])).toEqual([
      `משה בן שרה - ${EIGHT}`, `יוסף בן שרה - ${SAME_AS_ABOVE}`, `דוד בן שרה - ${SAME_AS_ABOVE}`,
    ])
  })

  it('מחיקת השם הראשון: הנוסח המלא עובר לשם שאחריו', () => {
    const lines = [line('משה', EIGHT), line('יוסף', EIGHT), line('דוד', EIGHT)]
    expect(formatRequestLines(lines.slice(1))).toEqual([`יוסף בן שרה - ${EIGHT}`, `דוד בן שרה - ${SAME_AS_ABOVE}`])
  })

  it('בקשה ארוכה שונה, או בקשה מסוג קבוע, לא הופכת ל"הנ"ל"', () => {
    const out = formatRequestLines([line('משה', EIGHT), line('יוסף', `${EIGHT} נוסף`), line('דוד', '', 'refua'), line('אהרן', '', 'refua')])
    expect(out[1]).toContain('נוסף')
    expect(out.slice(1).some(l => l.includes(SAME_AS_ABOVE))).toBe(false)
  })

  it('המקור לא משתנה: הבקשה המלאה נשארת בכל שורה', () => {
    const lines = [line('משה', EIGHT), line('יוסף', EIGHT)]
    applySharedRequests(lines)
    expect(lines.map(l => l.requestNote)).toEqual([EIGHT, EIGHT])
  })

  it('הקובץ (kvitelRequestLines) מקבל את הכלל', () => {
    const rows = ['משה', 'יוסף'].map((name, i) => ({
      id: String(i), position: i, name, relation: 'ben', parent_name: 'שרה',
      request_type: 'other', request_note: EIGHT, flagged: false, flag_reason: null,
    }))
    const out = kvitelRequestLines({ kvitel_request_lines: rows } as never)
    expect(out).toEqual([`משה בן שרה - ${EIGHT}`, `יוסף בן שרה - ${SAME_AS_ABOVE}`])
  })

  it('לשונית המייל (decodeFromSaved): "הנ"ל" בתצוגה, הבקשה המלאה בשורות לעריכה', () => {
    const d = decodeFromSaved({ id: 'r1', status: 'review', note: null }, ['משה', 'יוסף'].map((name, i) => ({
      id: `l${i}`, position: i, name, relation: 'ben', parent_name: 'שרה',
      request_type: 'other', request_note: EIGHT, flag_reason: null,
    })))
    expect(d.lines.map(l => l.request)).toEqual([EIGHT, SAME_AS_ABOVE])
    expect(d.rows!.map(r => r.request_note)).toEqual([EIGHT, EIGHT])
    expect(d.statusKey).toBe('review')
  })
})
