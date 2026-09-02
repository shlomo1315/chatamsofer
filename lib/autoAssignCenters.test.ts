import { describe, it, expect } from 'vitest'
import { buildAssignPlan, type AssignCenter, type AssignRecipient } from './autoAssignCenters'

const centers: AssignCenter[] = [
  { id: 'jm-big', name: 'אזור מאה שערים', city: 'ירושלים', taken: 439 },
  { id: 'jm-small', name: 'שכונת רמות פולין', city: 'ירושלים', taken: 165 },
  { id: 'bb', name: 'אזור סקולוב', city: 'בני ברק', taken: 506 },
  { id: 'arad', name: 'ערד', city: 'ערד', taken: 46 },
]

const rec = (id: string, city: string | null, extra: Partial<AssignRecipient> = {}): AssignRecipient =>
  ({ id, city, ...extra })

describe('buildAssignPlan — התאמה לפי עיר', () => {
  it('משבץ לעיר המתאימה', () => {
    const p = buildAssignPlan([rec('a', 'ערד')], centers)
    expect(p.rows).toEqual([
      { recipientId: 'a', centerId: 'arad', centerName: 'ערד', city: 'ערד' },
    ])
  })

  // 🔴 בערים גדולות המוקדים הם שכונות. איזון עומסים היה שולח משפחה
  // לקצה השני של העיר, ולכן נבחר המוקד שהכי הרבה בחרו בו.
  it('בעיר עם כמה מוקדים — לגדול ביותר', () => {
    const p = buildAssignPlan([rec('a', 'ירושלים')], centers)
    expect(p.rows[0].centerId).toBe('jm-big')
  })

  it('גרשיים ורווחים כפולים אינם מונעים התאמה', () => {
    const p = buildAssignPlan([rec('a', 'בני  ברק'), rec('b', 'בני ברק')], centers)
    expect(p.rows).toHaveLength(2)
    expect(p.rows.every(r => r.centerId === 'bb')).toBe(true)
  })

  it('עיר ללא מוקד — מדווחת ואינה משובצת', () => {
    const p = buildAssignPlan([rec('a', 'לוד'), rec('b', 'לוד'), rec('c', 'ערד')], centers)
    expect(p.rows).toHaveLength(1)
    expect(p.noCenterInCity).toEqual([{ city: 'לוד', count: 2 }])
  })

  it('כרטסת ללא עיר נספרת בנפרד', () => {
    const p = buildAssignPlan([rec('a', null), rec('b', '  ')], centers)
    expect(p.rows).toHaveLength(0)
    expect(p.noCity).toBe(2)
  })
})

// 🔴 הכלל החשוב ביותר: שיבוץ נועל את הבחירה. אין לשבץ משפחה שעדיין
// רשאית לבחור בעצמה — היא הייתה מגלה מוקד שנקבע לה בזמן שהמועד פתוח.
describe('buildAssignPlan — לא נוגע במי שעוד רשאי לבחור', () => {
  it('מדלג על הוספה ידנית ועל מי שסומן', () => {
    const p = buildAssignPlan([
      rec('a', 'ערד', { source: 'admin' }),
      rec('b', 'ערד', { source: 'portal', deadline_extended: true }),
      rec('c', 'ערד', { source: 'portal' }),
    ], centers)
    expect(p.rows.map(r => r.recipientId)).toEqual(['c'])
    expect(p.skippedStillOpen).toBe(2)
  })

  it('skipExtended=false משבץ גם אותם', () => {
    const p = buildAssignPlan(
      [rec('a', 'ערד', { source: 'admin' })], centers, { skipExtended: false },
    )
    expect(p.rows).toHaveLength(1)
    expect(p.skippedStillOpen).toBe(0)
  })
})

describe('buildAssignPlan — התצוגה המקדימה', () => {
  it('מסכם לפי מוקד, מהגדול לקטן', () => {
    const p = buildAssignPlan([
      rec('a', 'ירושלים'), rec('b', 'ירושלים'), rec('c', 'ערד'),
    ], centers)
    expect(p.byCenter).toEqual([
      { centerId: 'jm-big', centerName: 'אזור מאה שערים', count: 2, taken: 439 },
      { centerId: 'arad', centerName: 'ערד', count: 1, taken: 46 },
    ])
  })

  it('רשימה ריקה אינה קורסת', () => {
    const p = buildAssignPlan([], centers)
    expect(p.rows).toHaveLength(0)
    expect(p.byCenter).toHaveLength(0)
  })

  // ⚠️ בלי שובר-שוויון יציב אותה הרצה נותנת תוצאה אחרת בכל פעם,
  // לפי הסדר שהמסד החזיר.
  it('תיקו בין מוקדים נשבר לפי שם, ולא לפי סדר הקלט', () => {
    const tied: AssignCenter[] = [
      { id: 'b', name: 'בית', city: 'עיר', taken: 10 },
      { id: 'a', name: 'אלף', city: 'עיר', taken: 10 },
    ]
    const p1 = buildAssignPlan([rec('x', 'עיר')], tied)
    const p2 = buildAssignPlan([rec('x', 'עיר')], [...tied].reverse())
    expect(p1.rows[0].centerId).toBe(p2.rows[0].centerId)
  })
})
