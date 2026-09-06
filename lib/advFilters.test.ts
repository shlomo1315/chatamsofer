// טסטים לסינון המתקדם של רשימת הצאצאים — קריאת הפרמטרים מה-URL ותרגום
// טווח הגיל לטווח תאריכי לידה.
//
// 🔴 הערכים מגיעים מה-URL ונכנסים לשאילתה. הטסטים כאן מוודאים שהאימות
// fail-closed: כל מה שאינו מספר/תאריך תקין נזרק ולא מגיע למסד.
import { describe, it, expect } from 'vitest'
import { readAdvFilters, hasAdvFilters, ageToBirthRange } from './listParams'

const sp = (o: Record<string, string>) => new URLSearchParams(o)

describe('readAdvFilters — אימות קלט', () => {
  it('קורא טווחים תקינים', () => {
    const a = readAdvFilters(sp({ age_min: '20', age_max: '39', kids_min: '2', kids_max: '5' }))
    expect(a.ageMin).toBe(20)
    expect(a.ageMax).toBe(39)
    expect(a.kidsMin).toBe(2)
    expect(a.kidsMax).toBe(5)
  })

  it('זורק ערך שאינו מספר', () => {
    const a = readAdvFilters(sp({ age_min: 'abc', kids_max: '1;drop' }))
    expect(a.ageMin).toBeUndefined()
    expect(a.kidsMax).toBeUndefined()
  })

  it('זורק מספר מחוץ לגבולות השפויים', () => {
    const a = readAdvFilters(sp({ age_min: '-5', age_max: '999', kids_max: '5000' }))
    expect(a.ageMin).toBeUndefined()
    expect(a.ageMax).toBeUndefined()
    expect(a.kidsMax).toBeUndefined()
  })

  it('מחליף טווח הפוך במקום לזרוק אותו', () => {
    const a = readAdvFilters(sp({ age_min: '40', age_max: '20' }))
    expect(a.ageMin).toBe(20)
    expect(a.ageMax).toBe(40)
  })

  it('מחליף גם טווח תאריכים הפוך', () => {
    const a = readAdvFilters(sp({ reg_from: '2026-08-01', reg_to: '2026-01-01' }))
    expect(a.regFrom).toBe('2026-01-01')
    expect(a.regTo).toBe('2026-08-01')
  })

  it('מקבל רק תאריך בתבנית YYYY-MM-DD', () => {
    expect(readAdvFilters(sp({ reg_from: '01/08/2026' })).regFrom).toBeUndefined()
    expect(readAdvFilters(sp({ reg_from: '2026-13-45' })).regFrom).toBeUndefined()
    expect(readAdvFilters(sp({ reg_from: '2026-08-01' })).regFrom).toBe('2026-08-01')
  })

  it('מקבל רק ערכי מין/עץ מוכרים', () => {
    expect(readAdvFilters(sp({ gender: 'male' })).gender).toBe('male')
    expect(readAdvFilters(sp({ gender: 'other' })).gender).toBeUndefined()
    expect(readAdvFilters(sp({ lineage: 'unlinked' })).lineage).toBe('unlinked')
    expect(readAdvFilters(sp({ lineage: 'nope' })).lineage).toBeUndefined()
  })

  it('חותך קהילה ארוכה מדי ושומר על טקסט חופשי', () => {
    expect(readAdvFilters(sp({ community: '  ויזניץ  ' })).community).toBe('ויזניץ')
    expect(readAdvFilters(sp({ community: 'x'.repeat(500) })).community).toHaveLength(100)
    expect(readAdvFilters(sp({ community: '   ' })).community).toBeUndefined()
  })

  it('hasAdvFilters מזהה ריק מול פעיל', () => {
    expect(hasAdvFilters(readAdvFilters(sp({})))).toBe(false)
    expect(hasAdvFilters(readAdvFilters(sp({ age_min: '20' })))).toBe(true)
    // ⚠️ גיל 0 הוא סינון פעיל לכל דבר ולא "ריק".
    expect(hasAdvFilters(readAdvFilters(sp({ age_min: '0' })))).toBe(true)
  })
})

describe('ageToBirthRange — גבולות הגיל', () => {
  const today = new Date('2026-09-06T00:00:00Z')

  it('גיל מינימלי → תאריך לידה מאוחר ביותר', () => {
    const { to } = ageToBirthRange(20, undefined, today)
    expect(to).toBe('2006-09-06')
  })

  it('מי שגילו בדיוק ageMax עדיין נכלל', () => {
    // בן 39 בדיוק היום — נולד ב-2026-09-06 פחות 39 שנים.
    const { from } = ageToBirthRange(undefined, 39, today)
    expect(from).toBe('1986-09-07')
    // מי שנולד בדיוק ביום הזה הוא בן 39 ו-364 ימים — עדיין 39.
    expect(from! <= '1986-09-07').toBe(true)
  })

  it('טווח מלא מחזיר שני גבולות', () => {
    const r = ageToBirthRange(20, 39, today)
    expect(r.from).toBe('1986-09-07')
    expect(r.to).toBe('2006-09-06')
    // הגבול התחתון קודם לעליון — אחרת השאילתה מחזירה ריק תמיד.
    expect(r.from! < r.to!).toBe(true)
  })

  it('בלי גיל כלל — בלי גבולות', () => {
    expect(ageToBirthRange(undefined, undefined, today)).toEqual({})
  })

  it('גיל 0 אינו נזרק כ"ריק"', () => {
    const r = ageToBirthRange(0, 0, today)
    expect(r.to).toBe('2026-09-06')
    expect(r.from).toBe('2025-09-07')
  })
})
