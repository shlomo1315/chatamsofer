import { describe, it, expect } from 'vitest'
import { scopeBulkApproval, describeApprovalScope, type ApprovalCandidate } from './bulkApproval'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 אישור המוני — 6,047 משפחות ממתינות, וסימון ידני אינו מעשי.
//
// ⚠️ אישור פותח את הדרך לכסף: מאושר יכול לבחור מוקד, ומי שבחר מוקד
// ייטען. לכן הכלי חייב לומר בדיוק *מי* ייכלל, ולעולם לא לגעת במי שכבר
// הוכרע ידנית.
// ─────────────────────────────────────────────────────────────────────────────

const rows: ApprovalCandidate[] = [
  { id: 'a', approval_status: 'pending',  idNumber: '123456782' },
  { id: 'b', approval_status: 'pending',  idNumber: '123456782' }, // כפילות ת"ז
  { id: 'c', approval_status: 'approved', idNumber: '987654321' },
  { id: 'd', approval_status: 'rejected', idNumber: '111111118' },
  { id: 'e', approval_status: 'pending',  idNumber: '' },
  { id: 'f', approval_status: 'pending',  idNumber: '222222220' },
]

describe('scopeBulkApproval — 🔴 מי נכלל', () => {
  it('רק ממתינים — לא נוגעים במי שכבר הוכרע', () => {
    const r = scopeBulkApproval(rows)
    expect(r.ids).toContain('a')
    expect(r.ids).not.toContain('c')
    expect(r.ids).not.toContain('d')
  })

  it('🔴 דחייה אינה נהפכת לאישור בטעות', () => {
    // ⚠️ המקרה המסוכן: "אשר את כולם" שמבטל החלטה ידנית לדחות.
    const r = scopeBulkApproval(rows)
    expect(r.skipped.alreadyDecided).toBe(2) // c + d
  })

  it('🔴 בלי ת"ז — לא מאושר. אי אפשר לטעון לו כרטיס בהמשך', () => {
    const r = scopeBulkApproval(rows)
    expect(r.ids).not.toContain('e')
    expect(r.skipped.noId).toBe(1)
  })

  it('⚠️ כפילות ת"ז — רק הראשון. שתי שורות לאותו אדם = טעינה כפולה', () => {
    const r = scopeBulkApproval(rows)
    expect(r.ids.filter(id => id === 'a' || id === 'b')).toHaveLength(1)
    expect(r.skipped.duplicateId).toBe(1)
  })

  it('רשימה ריקה אינה קורסת', () => {
    const r = scopeBulkApproval([])
    expect(r.ids).toEqual([])
    expect(r.total).toBe(0)
  })
})

describe('⚠️ הגבלה לרשימה שנבחרה', () => {
  it('onlyIds מצמצם — ולא מרחיב', () => {
    const r = scopeBulkApproval(rows, { onlyIds: new Set(['a', 'c']) })
    expect(r.ids).toEqual(['a'])
  })

  it('🔴 onlyIds אינו עוקף את כללי הזכאות', () => {
    // ⚠️ בחירה מפורשת של שורה בלי ת"ז עדיין נחסמת: הכללים הם הכללים,
    // והבחירה מצמצמת אותם בלבד.
    const r = scopeBulkApproval(rows, { onlyIds: new Set(['e']) })
    expect(r.ids).toEqual([])
  })
})

describe('describeApprovalScope — הניסוח לפני האישור', () => {
  it('אומר כמה ייכללו', () => {
    // ⚠️ שניים ולא שלושה: b נופל ככפילות ת"ז ו-e בלי ת"ז.
    expect(describeApprovalScope(scopeBulkApproval(rows))).toContain('2 משפחות')
  })

  it('⚠️ מפרט מי לא ייכלל — אחרת ההפרש נראה כתקלה', () => {
    const t = describeApprovalScope(scopeBulkApproval(rows))
    expect(t).toContain('ת״ז')
    expect(t).toContain('הוכרעו')
  })

  it('אין מי לאשר — נאמר במפורש', () => {
    expect(describeApprovalScope(scopeBulkApproval([]))).toContain('אין')
  })
})
