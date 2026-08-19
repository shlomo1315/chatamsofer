import { describe, it, expect } from 'vitest'
import { isValidDateValue, toSafeDateValue } from './safeDateValue'

// שחזור הקריסה: parseLocalDate של HebrewDatePicker נופל ל-new Date(v) לכל ערך
// שאינו YYYY-MM-DD, ואז new HDate(InvalidDate) זורק RangeError בזמן render.
const parseLocalDate = (v: string): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v)
}

describe('isValidDateValue', () => {
  it('מזהה תאריכים תקינים', () => {
    expect(isValidDateValue('2026-08-19')).toBe(true)
    expect(isValidDateValue('2026-08-19T00:00:00Z')).toBe(true)
  })
  it('דוחה ריק ופגום', () => {
    expect(isValidDateValue('')).toBe(false)
    expect(isValidDateValue(null)).toBe(false)
    expect(isValidDateValue(undefined)).toBe(false)
    expect(isValidDateValue('19/08/2026')).toBe(false)
    expect(isValidDateValue('לא ידוע')).toBe(false)
  })
})

describe('toSafeDateValue', () => {
  it('משאיר YYYY-MM-DD כמו שהוא', () => {
    expect(toSafeDateValue('2026-08-19')).toBe('2026-08-19')
  })
  it('מנרמל timestamp מלא לתאריך בלבד', () => {
    expect(toSafeDateValue('2026-08-19T13:45:00')).toBe('2026-08-19')
  })
  it('מחזיר ריק לערך פגום — במקום להפיל', () => {
    for (const bad of ['', '19/08/2026', 'לא ידוע', 'null', null, undefined]) {
      expect(toSafeDateValue(bad)).toBe('')
    }
  })
  it('לא מזיז יום אחורה באזור זמן ישראל (הבאג "יום לפני")', () => {
    expect(toSafeDateValue('2026-01-16T00:00:00')).toBe('2026-01-16')
  })
})

describe('הגנת הקריסה בפועל', () => {
  const bad = ['19/08/2026', 'לא ידוע', 'null']

  it('ערך פגום אכן יוצר Invalid Date — זו הקריסה המקורית', () => {
    for (const v of bad) {
      expect(Number.isNaN(parseLocalDate(v).getTime())).toBe(true)
    }
  })

  it('אחרי הסינון אף ערך לא מגיע כ-Invalid Date לרכיב', () => {
    for (const v of [...bad, '2026-08-19', '']) {
      const safe = toSafeDateValue(v)
      if (!safe) continue                       // ריק — הרכיב מדלג על HDate
      expect(Number.isNaN(parseLocalDate(safe).getTime())).toBe(false)
    }
  })
})
