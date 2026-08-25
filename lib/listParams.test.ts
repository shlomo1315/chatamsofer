import { describe, it, expect } from 'vitest'
import { parseColFilters, encodeColFilters, readListParams } from './listParams'

const sp = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
const ALLOW = ['city', 'marital_status', 'eligibility_status'] as const


describe('parseColFilters', () => {
  it('מפענח עמודה אחת עם כמה ערכים', () => {
    expect(parseColFilters('city:ירושלים|ערד', ALLOW)).toEqual({ city: ['ירושלים', 'ערד'] })
  })

  it('מפענח כמה עמודות', () => {
    expect(parseColFilters('city:ערד;marital_status:אלמן', ALLOW)).toEqual({
      city: ['ערד'], marital_status: ['אלמן'],
    })
  })

  it('ריק או חסר → אין סינון', () => {
    expect(parseColFilters(null, ALLOW)).toEqual({})
    expect(parseColFilters('', ALLOW)).toEqual({})
  })

  it('🔴 פוסל שם עמודה שאינו מזהה תקין', () => {
    // הערך מגיע מה-URL ומשמש כשם עמודה בשאילתה — ערך חופשי כאן היה
    // פותח הזרקה דרך .eq()/.in().
    expect(parseColFilters('city);drop:x', ALLOW)).toEqual({})
    expect(parseColFilters('a b:x', ALLOW)).toEqual({})
    expect(parseColFilters('1col:x', ALLOW)).toEqual({})
    expect(parseColFilters(':x', ALLOW)).toEqual({})
  })

  it('מדלג על חלק פגום ושומר את התקין', () => {
    expect(parseColFilters('bad part;city:ערד', ALLOW)).toEqual({ city: ['ערד'] })
  })

  it('מפענח ערכים מקודדים (תווים מיוחדים בשם עיר)', () => {
    const enc = encodeURIComponent('תל אביב-יפו')
    expect(parseColFilters(`city:${enc}`, ALLOW)).toEqual({ city: ['תל אביב-יפו'] })
  })
})

describe('encodeColFilters', () => {
  it('הלוך ושוב שומר על הערכים', () => {
    const f = { city: ['ירושלים', 'תל אביב-יפו'], marital_status: ['אלמן'] }
    expect(parseColFilters(encodeColFilters(f), ALLOW)).toEqual(f)
  })

  it('עמודה בלי ערכים יורדת', () => {
    expect(encodeColFilters({ city: [] })).toBe('')
  })
})

describe('readListParams — מיון מהכותרת', () => {
  it('קורא עמודה וכיוון', () => {
    const p = readListParams(sp({ col: 'city', dir: 'desc' }), { sortCols: ALLOW })
    expect(p.col).toBe('city')
    expect(p.dir).toBe('desc')
  })

  it('כיוון לא מוכר → asc', () => {
    expect(readListParams(sp({ dir: 'sideways' }), { sortCols: ALLOW }).dir).toBe('asc')
  })

  it('🔴 שם עמודה פסול נזרק ואינו מגיע לשאילתה', () => {
    expect(readListParams(sp({ col: 'city; drop table' }), { sortCols: ALLOW }).col).toBe('')
  })

  it('ברירת מחדל — בלי מיון מהכותרת', () => {
    const p = readListParams(sp({}), { sortCols: ALLOW })
    expect(p.col).toBe('')
    expect(p.colFilters).toEqual({})
  })
})

describe('🔴 allowlist — ההגנה האמיתית', () => {
  it('שם עמודה שאינו ברשימה נזרק, גם כשהוא מזהה תקין', () => {
    // 'city);drop:x' מתפצל ב-';' ל-'city)' (נפסל) ול-'drop:x'.
    // 'drop' הוא מזהה תקין לחלוטין — רק ה-allowlist עוצר אותו.
    expect(parseColFilters('city);drop:x', ALLOW)).toEqual({})
    expect(parseColFilters('secret_column:x', ALLOW)).toEqual({})
  })

  it('בלי רשימת היתר — אין סינון כלל (fail-closed)', () => {
    expect(parseColFilters('city:ערד')).toEqual({})
    expect(readListParams(sp({ col: 'city' })).col).toBe('')
  })

  it('עמודת מיון שאינה ברשימה נזרקת', () => {
    expect(readListParams(sp({ col: 'password' }), { sortCols: ALLOW }).col).toBe('')
  })
})
