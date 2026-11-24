import { describe, it, expect, vi, beforeEach } from 'vitest'

// כרטסות "במסד": הדמה מחזירה את כולן, והסינון המדויק הוא של הקוד עצמו.
const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], orFilter: '', limit: 0 }))
vi.mock('@/lib/apiAuth', () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        or: (f: string) => {
          db.orFilter = f
          return { limit: async (n: number) => { db.limit = n; return { data: db.rows } } }
        },
      }),
    }),
  }),
}))

import { findRegistrantByPassportDigits, findMemberByPassportDigits } from './holidaysData'

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, id_number: null, spouse_id_number: null, is_active: true, eligibility_status: 'eligible', ...over,
})

beforeEach(() => { db.rows = []; db.orFilter = ''; db.limit = 0 })

describe('זיהוי לפי ספרות המספר השמור — כל הפורמטים במסד', () => {
  it.each([
    ['דרכון בספרות בלבד (מקרה 556212027)', '556212027', '556212027'],
    ['דרכון עם אותיות', 'AB1234567', '1234567'],
    ['דרכון עם אותיות ורווח/מקף', 'ab 123-4567', '1234567'],
    ['ת"ז שנשמרה עם אפס מוביל, הוקשה בלעדיו', '012345678', '12345678'],
    ['ת"ז שנשמרה בלי אפס מוביל, הוקשה איתו', '12345678', '012345678'],
    ['ת"ז עם מקפים ורווחים', '55-621 2027', '556212027'],
    ['דרכון קצר מ-9 ספרות', 'X98765', '98765'],
  ])('%s', async (_label, stored, typed) => {
    db.rows = [row('b1', { id_number: stored })]
    expect((await findRegistrantByPassportDigits(typed))?.id).toBe('b1')
  })

  it('מספר של בן/בת הזוג מזהה את אותה כרטסת', async () => {
    db.rows = [row('b1', { id_number: '123456782', spouse_id_number: 'P556212027' })]
    expect((await findMemberByPassportDigits('556212027'))?.id).toBe('b1')
  })

  it('לא מזהה לפי חלק מהספרות או מספר שהספרות שלו מופיעות בו עם ספרות נוספות', async () => {
    db.rows = [row('b1', { id_number: '5562120271' }), row('b2', { id_number: '55621202' })]
    expect(await findRegistrantByPassportDigits('556212027')).toBeNull()
  })

  it('🔴 אותן ספרות בשתי כרטסות פעילות — לא מנחשים', async () => {
    db.rows = [row('b1', { id_number: 'AB1234567' }), row('b2', { id_number: 'CD1234567' })]
    expect(await findRegistrantByPassportDigits('1234567')).toBeNull()
  })

  it('כפילות שרק אחת מהן פעילה — הפעילה מזוהה', async () => {
    db.rows = [row('old', { id_number: '556212027', is_active: false }), row('b1', { id_number: '556212027' })]
    expect((await findRegistrantByPassportDigits('556212027'))?.id).toBe('b1')
  })

  it('פחות מ-5 ספרות (גם אחרי הסרת אפסים) — לא מחפשים בכלל', async () => {
    expect(await findRegistrantByPassportDigits('0001234')).toBeNull()
    expect(db.orFilter).toBe('')
  })

  it('החיפוש בשתי העמודות, בלי אפסים מובילים בתבנית, ובמגבלה שלא חותכת התאמות', async () => {
    db.rows = [row('b1', { id_number: '012345678' })]
    await findRegistrantByPassportDigits('012345678')
    expect(db.orFilter).toBe('id_number.ilike.*1*2*3*4*5*6*7*8*,spouse_id_number.ilike.*1*2*3*4*5*6*7*8*')
    expect(db.limit).toBeGreaterThanOrEqual(500)
  })
})
