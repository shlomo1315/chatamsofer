import { describe, it, expect } from 'vitest'
import { findDeepReviewGaps, classifyLineage, reviewDeepReviewFamilies, type GapNode, type GapBen } from './deepReviewGaps'
import { buildApprovedRefTree } from './lineageApprovedRef'

// קובץ מאושר: חתם סופר ← שמעון ← יוסף ← משה ← אברהם (דורות 1–5)
const approved = buildApprovedRefTree([
  { key: 'r1', name: 'חתם סופר', generation: 1, parent_key: null },
  { key: 'r2', name: 'שמעון', generation: 2, parent_key: 'r1' },
  { key: 'r3', name: 'יוסף', generation: 3, parent_key: 'r2' },
  { key: 'r4', name: 'משה', generation: 4, parent_key: 'r3' },
  { key: 'r5', name: 'אברהם', generation: 5, parent_key: 'r4' },
])

const nodes: GapNode[] = [
  { id: 'n1', name: 'חתם סופר', parent_id: null, generation: 1 },
  { id: 'n2', name: 'שמעון', parent_id: 'n1', generation: 2 },
  { id: 'n3', name: 'יוסף', parent_id: 'n2', generation: 3 },
  { id: 'n4', name: 'משה', parent_id: 'n3', generation: 4 },
  { id: 'n5', name: 'אברהם', parent_id: 'n4', generation: 5 },
  { id: 'n6', name: 'דוד', parent_id: 'n5', generation: 6 },
  // ענף שגוי: "בנימין" בדור 4 — לא בקובץ המאושר, אבל קיים בעץ (הוקלד פעם)
  { id: 'x4', name: 'בנימין', parent_id: 'n3', generation: 4 },
  { id: 'x5', name: 'אברהם', parent_id: 'x4', generation: 5 },
  { id: 'x6', name: 'דוד', parent_id: 'x5', generation: 6 },
  // דילוג דורות: דור 7 מתחת לדור 5
  { id: 'g7', name: 'צבי', parent_id: 'n5', generation: 7 },
  // מנותק
  { id: 'o6', name: 'יתום', parent_id: 'missing', generation: 6 },
]
const byId = new Map(nodes.map(n => [n.id, n]))

const ben = (over: Partial<GapBen>): GapBen => ({
  id: 'b', id_number: '1', full_name: 'פלוני', family_name: 'פלוני', eligibility_status: 'pending', lineage_node_id: null, ...over,
})

describe('classifyLineage', () => {
  it('מסלול תקין מתחת לדור 5 — אין ממצא', () => {
    expect(classifyLineage(ben({ lineage_node_id: 'n6' }), byId, approved)).toBeNull()
    expect(classifyLineage(ben({ lineage_node_id: 'n5' }), byId, approved)).toBeNull()
  })

  it('בחירה מהרשימה בענף שאינו בקובץ — not_in_ref, גם בלי הקלדה ידנית', () => {
    expect(classifyLineage(ben({ lineage_node_id: 'x6' }), byId, approved))
      .toMatchObject({ kind: 'not_in_ref', generation: 4, detail: 'בנימין' })
  })

  it('אותו שם בדור 5 תחת הורה שגוי — נתפס (בדיקת הורה, לא רק שם ודור)', () => {
    expect(classifyLineage(ben({ lineage_node_id: 'x5' }), byId, approved)?.kind).toBe('not_in_ref')
  })

  it('עוגן בדור 3 — המשפחה עצמה בתוך 5 הדורות', () => {
    expect(classifyLineage(ben({ lineage_node_id: 'n3' }), byId, approved))
      .toMatchObject({ kind: 'too_shallow', generation: 4 })
  })

  it('דילוג דורות ומנותק', () => {
    expect(classifyLineage(ben({ lineage_node_id: 'g7' }), byId, approved)?.kind).toBe('gen_gap')
    expect(classifyLineage(ben({ lineage_node_id: 'o6' }), byId, approved)?.kind).toBe('broken_node')
  })

  it('בלי שיוך לעץ — נבדקת השרשרת השמורה', () => {
    const good = [{ generation: 2, name: 'שמעון' }, { generation: 3, name: 'יוסף' }, { generation: 4, name: 'משה' }, { generation: 5, name: 'אברהם' }]
    expect(classifyLineage(ben({ lineage_chain: good }), byId, approved)).toBeNull()
    const bad = good.map(e => e.generation === 3 ? { ...e, name: 'ראובן' } : e)
    expect(classifyLineage(ben({ lineage_chain: bad }), byId, approved)).toMatchObject({ kind: 'no_node', generation: 3 })
    expect(classifyLineage(ben({ lineage_chain: good.slice(0, 2) }), byId, approved)).toMatchObject({ kind: 'no_node', generation: 4 })
  })

  it('אין שיוך ואין שרשרת — no_lineage', () => {
    expect(classifyLineage(ben({ lineage_manual: ['שמעון'] }), byId, approved))
      .toMatchObject({ kind: 'no_lineage', detail: 'יש רק שמות שהוקלדו ידנית' })
  })
})

describe('findDeepReviewGaps', () => {
  it('מדלג על deep_review ו-rejected, ומחזיר את השאר עם ת"ז ושם', () => {
    const rows = findDeepReviewGaps([
      ben({ id: 'a', id_number: '302746730', full_name: 'יעקב', lineage_node_id: 'x6', spouse_name: 'שרה' }),
      ben({ id: 'b', eligibility_status: 'approved', lineage_node_id: 'x6' }),
      ben({ id: 'c', eligibility_status: 'deep_review', lineage_node_id: 'x6' }),
      ben({ id: 'd', eligibility_status: 'rejected', lineage_node_id: 'x6' }),
      ben({ id: 'e', lineage_node_id: 'n6' }),
    ], nodes, approved)
    expect(rows.map(r => r.id)).toEqual(['a', 'b'])
    // ⚠️ full_name הוא השם הפרטי — השם המוצג הוא משפחה ואז פרטי
    expect(rows[0]).toMatchObject({ id_number: '302746730', name: 'פלוני יעקב ושרה', status: 'pending', kind: 'not_in_ref' })
  })
})

describe('reviewDeepReviewFamilies — הכיוון ההפוך', () => {
  it('רק משפחות בבדיקה מעמיקה; מסמן מי עדיין שגוי ומי כבר תקין', () => {
    const rows = reviewDeepReviewFamilies([
      { ...ben({ id: 'a', eligibility_status: 'deep_review', lineage_node_id: 'x6' }), deep_review_reason: 'דור 2–5 אינו בקובץ המאושר (דור 4: בנימין)' },
      { ...ben({ id: 'b', eligibility_status: 'deep_review', lineage_node_id: 'n6' }), deep_review_reason: 'הערה של המזכיר' },
      ben({ id: 'c', eligibility_status: 'deep_review', lineage_node_id: 'n6' }),
      ben({ id: 'd', eligibility_status: 'pending', lineage_node_id: 'x6' }),
    ], nodes, approved)
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(rows[0].finding).toMatchObject({ kind: 'not_in_ref', generation: 4 })
    // תקינים כעת — הדגל נשאר מהרישום או מהערת מזכיר
    expect(rows[1]).toMatchObject({ finding: null, reason: 'הערה של המזכיר' })
    expect(rows[2]).toMatchObject({ finding: null, reason: null })
  })

  it('עוגן רדוד בבדיקה מעמיקה נשאר שגוי (too_shallow)', () => {
    const [r] = reviewDeepReviewFamilies([ben({ eligibility_status: 'deep_review', lineage_node_id: 'n3' })], nodes, approved)
    expect(r.finding?.kind).toBe('too_shallow')
  })
})
