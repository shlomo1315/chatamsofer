import { describe, it, expect } from 'vitest'
import { ageFrom, applyFilters, type ReportRow } from './reportFilters'

// ⚠️ הסינון כאן ולא ברכיב — כך הוא נבדק על מקרי הקצה האמיתיים של
// המאגר: 263 משפחות בלי שיוך לדור, 62 בלי תאריך לידה, 51 בלי מצב
// משפחתי. שורה שנופלת בגלל נתון חסר חייבת להיספר, לא להיעלם בשקט.

const TODAY = new Date('2026-08-24')

function row(over: Partial<ReportRow> = {}): ReportRow {
  return {
    id: 'b1', familyName: 'ישראלי', fullName: 'משה', idNumber: '123456789',
    city: 'ירושלים', address: 'הרצל 1', phone: '0501234567', email: 'a@b.com',
    community: 'ליטאי', generation: 8, birthDate: '1990-01-01',
    childrenCount: 4, maritalStatus: 'נשואים', status: 'approved', ...over,
  }
}

describe('ageFrom', () => {
  it('מחשב גיל נכון', () => {
    expect(ageFrom('1990-01-01', TODAY)).toBe(36)
  })

  it('יום הולדת שטרם הגיע השנה — שנה פחות', () => {
    expect(ageFrom('1990-12-31', TODAY)).toBe(35)
  })

  it('🔴 תאריך חסר מחזיר null ולא 0', () => {
    // גיל 0 היה נכלל בסינון "עד גיל 30" ומזייף את הדוח.
    expect(ageFrom(null, TODAY)).toBeNull()
  })

  it('🔴 תאריך פגום מחזיר null ואינו זורק', () => {
    // new Date('לא-תאריך') הוא Invalid Date; חישוב עליו מחזיר NaN.
    expect(ageFrom('לא-תאריך', TODAY)).toBeNull()
    expect(ageFrom('', TODAY)).toBeNull()
  })
})

describe('applyFilters — בלי סינון', () => {
  it('בלי שום סינון כל השורות נכללות', () => {
    const rows = [row(), row({ id: 'b2', generation: null, birthDate: null })]
    const res = applyFilters(rows, {}, TODAY)
    expect(res.rows).toHaveLength(2)
    expect(res.excluded).toEqual([])
  })

  it('⚠️ מערך סינון ריק אינו מחריג דבר', () => {
    // [] פירושו "לא נבחר", לא "אף אחד" — אחרת הדוח יוצא ריק.
    const rows = [row()]
    expect(applyFilters(rows, { communities: [], cities: [] }, TODAY).rows).toHaveLength(1)
  })
})

describe('applyFilters — סינונים', () => {
  const rows = [
    row({ id: 'a', community: 'ליטאי', generation: 8, city: 'ירושלים', childrenCount: 4, birthDate: '1990-01-01' }),
    row({ id: 'b', community: 'בעלזא', generation: 9, city: 'בית שמש', childrenCount: 7, birthDate: '1975-01-01' }),
    row({ id: 'c', community: 'ליטאי', generation: 9, city: 'בית שמש', childrenCount: 2, birthDate: '2000-01-01' }),
  ]

  it('קהילה', () => {
    expect(applyFilters(rows, { communities: ['ליטאי'] }, TODAY).rows.map(r => r.id)).toEqual(['a', 'c'])
  })

  it('דור', () => {
    expect(applyFilters(rows, { generations: [9] }, TODAY).rows.map(r => r.id)).toEqual(['b', 'c'])
  })

  it('עיר', () => {
    expect(applyFilters(rows, { cities: ['בית שמש'] }, TODAY).rows.map(r => r.id)).toEqual(['b', 'c'])
  })

  it('טווח ילדים כולל את הקצוות', () => {
    expect(applyFilters(rows, { childrenMin: 2, childrenMax: 4 }, TODAY).rows.map(r => r.id)).toEqual(['a', 'c'])
  })

  it('טווח גיל', () => {
    expect(applyFilters(rows, { ageMin: 40 }, TODAY).rows.map(r => r.id)).toEqual(['b'])
  })

  it('🔴 צירוף סינונים — דור + עיר + ילדים', () => {
    const res = applyFilters(rows, { generations: [9], cities: ['בית שמש'], childrenMin: 5 }, TODAY)
    expect(res.rows.map(r => r.id)).toEqual(['b'])
  })

  it('מצב משפחתי — חמשת הערכים בעברית', () => {
    const list = [row({ id: 'x', maritalStatus: 'אלמנה' }), row({ id: 'y', maritalStatus: 'נשואים' })]
    expect(applyFilters(list, { maritalStatuses: ['אלמנה'] }, TODAY).rows.map(r => r.id)).toEqual(['x'])
  })

  it('סטטוס רישום', () => {
    const list = [row({ id: 'x', status: 'approved' }), row({ id: 'y', status: 'pending' })]
    expect(applyFilters(list, { statuses: ['pending'] }, TODAY).rows.map(r => r.id)).toEqual(['y'])
  })
})

describe('🔴 מוחרגים בגלל נתון חסר — נספרים ולא נעלמים', () => {
  it('שורה בלי דור מוחרגת מסינון דור ונספרת', () => {
    // 263 משפחות במאגר בלי lineage_node_id — 3.7% שהיו נעלמים בשקט.
    const rows = [row({ id: 'a', generation: 8 }), row({ id: 'b', generation: null })]
    const res = applyFilters(rows, { generations: [8] }, TODAY)
    expect(res.rows.map(r => r.id)).toEqual(['a'])
    expect(res.excluded).toContainEqual({ reason: 'חסר שיוך לדור', count: 1 })
  })

  it('שורה בלי תאריך לידה מוחרגת מסינון גיל ונספרת', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', birthDate: null })]
    const res = applyFilters(rows, { ageMin: 20 }, TODAY)
    expect(res.excluded).toContainEqual({ reason: 'חסר תאריך לידה', count: 1 })
  })

  it('שורה בלי קהילה מוחרגת מסינון קהילה ונספרת', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', community: null })]
    const res = applyFilters(rows, { communities: ['ליטאי'] }, TODAY)
    expect(res.excluded).toContainEqual({ reason: 'חסר שיוך לקהילה', count: 1 })
  })

  it('⚠️ בלי סינון על השדה — שורה חסרה אינה מוחרגת', () => {
    const rows = [row({ id: 'b', generation: null, birthDate: null })]
    const res = applyFilters(rows, { cities: ['ירושלים'] }, TODAY)
    expect(res.rows).toHaveLength(1)
    expect(res.excluded).toEqual([])
  })

  it('⚠️ שורה שלא תואמת אינה נספרת כמוחרגת', () => {
    // "לא תואם" הוא תשובה; "חסר נתון" הוא ליקוי. ערבוב ביניהם היה
    // מציג אזהרה על כל דוח מסונן.
    const rows = [row({ id: 'a', city: 'ירושלים' }), row({ id: 'b', city: 'בית שמש' })]
    const res = applyFilters(rows, { cities: ['ירושלים'] }, TODAY)
    expect(res.rows).toHaveLength(1)
    expect(res.excluded).toEqual([])
  })
})
