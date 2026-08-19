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

// ─────────────────────────────────────────────────────────────────────────────
// מקור ההרעלה: normalizeDateToISO החזיר ערך לא-מזוהה *כמות שהוא* (`return v`),
// למרות שההערה מעליו הבטיחה "מניעת תאריכים פגומים ב-JSON". כך נכנסו למאגר
// מחרוזות שאינן תאריך, וחזרו אחר כך לטופס והפילו את הרינדור.
// ─────────────────────────────────────────────────────────────────────────────
import { normalizeDateToISO } from './validation'
import { sanitizeChildrenDates } from './safeDateValue'

describe('normalizeDateToISO — לא מחזיר זבל', () => {
  it('ממיר את הפורמטים המוכרים', () => {
    expect(normalizeDateToISO('2026-08-19')).toBe('2026-08-19')
    expect(normalizeDateToISO('19082026')).toBe('2026-08-19')   // נדרים DDMMYYYY
    expect(normalizeDateToISO('19/08/2026')).toBe('2026-08-19')
    expect(normalizeDateToISO('19.08.2026')).toBe('2026-08-19')
  })

  it('🔴 ערך שאינו תאריך מוחזר null — ולא כמחרוזת גולמית', () => {
    for (const junk of ['לא ידוע', 'אין', 'xyz', '00-00-0000', '13/13/2026']) {
      expect(normalizeDateToISO(junk)).toBeNull()
    }
  })

  it('ריק מוחזר null', () => {
    expect(normalizeDateToISO('')).toBeNull()
    expect(normalizeDateToISO(null)).toBeNull()
  })
})

describe('sanitizeChildrenDates', () => {
  it('מנקה תאריך פגום ומשאיר את שאר השדות', () => {
    const out = sanitizeChildrenDates([
      { name: 'א', birth_date: '2026-08-19' },
      { name: 'ב', birth_date: 'לא ידוע' },
      { name: 'ג', birth_date: undefined },
    ])
    expect(out[0]).toEqual({ name: 'א', birth_date: '2026-08-19' })
    expect(out[1]).toEqual({ name: 'ב', birth_date: '' })
    expect(out[2]).toEqual({ name: 'ג', birth_date: '' })
  })
})
