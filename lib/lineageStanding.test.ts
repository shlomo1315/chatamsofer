import { describe, it, expect } from 'vitest'
import { lineageStanding, reviewReasonOf, buildLineageReport, MISTAKE_REASONS, REVIEW_REASON_LABEL } from './lineageStanding'
import { GAP_KIND_LABEL, type GapNode, type GapBen } from './deepReviewGaps'
import { buildApprovedRefTree } from './lineageApprovedRef'

// קובץ מאושר: חתם סופר ← שמעון ← יוסף ← משה ← אברהם (דורות 1–5)
const approved = buildApprovedRefTree([
  { key: 'r1', name: 'חתם סופר', generation: 1, parent_key: null },
  { key: 'r2', name: 'שמעון', generation: 2, parent_key: 'r1' },
  { key: 'r3', name: 'יוסף', generation: 3, parent_key: 'r2' },
  { key: 'r4', name: 'משה', generation: 4, parent_key: 'r3' },
  { key: 'r5', name: 'אברהם', generation: 5, parent_key: 'r4' },
])

const v = 'verified'
const nodes: GapNode[] = [
  { id: 'n1', name: 'חתם סופר', parent_id: null, generation: 1, status: v },
  { id: 'n2', name: 'שמעון', parent_id: 'n1', generation: 2, status: v },
  { id: 'n3', name: 'יוסף', parent_id: 'n2', generation: 3, status: v },
  { id: 'n4', name: 'משה', parent_id: 'n3', generation: 4, status: v },
  { id: 'n5', name: 'אברהם', parent_id: 'n4', generation: 5, status: v },
  { id: 'n6', name: 'דוד', parent_id: 'n5', generation: 6, status: v },
  { id: 'p6', name: 'שלמה', parent_id: 'n5', generation: 6, status: 'pending' },
  // ענף שאב בדור 6 בו נפסל, והנכד מתחתיו "מאושר" בעץ
  { id: 'r6', name: 'ראובן', parent_id: 'n5', generation: 6, status: 'rejected' },
  { id: 'r7', name: 'נפתלי', parent_id: 'r6', generation: 7, status: v },
  // שתי פסילות במסלול: הקרובה לשורש היא המקור
  { id: 'q5', name: 'אברהם', parent_id: 'n4', generation: 5, status: 'rejected' },
  { id: 'q6', name: 'זלמן', parent_id: 'q5', generation: 6, status: 'rejected' },
  { id: 'q7', name: 'חיים', parent_id: 'q6', generation: 7, status: 'pending' },
  // ענף שאינו בקובץ המאושר
  { id: 'x4', name: 'בנימין', parent_id: 'n3', generation: 4, status: v },
  { id: 'x6', name: 'דוד', parent_id: 'x5', generation: 6, status: v },
  { id: 'x5', name: 'אברהם', parent_id: 'x4', generation: 5, status: v },
  { id: 'g7', name: 'צבי', parent_id: 'n5', generation: 7, status: v },
  { id: 'o6', name: 'יתום', parent_id: 'missing', generation: 6, status: v },
]
const byId = new Map(nodes.map(n => [n.id, n]))

type Ben = GapBen & { deep_review_reason?: string | null }
const ben = (over: Partial<Ben>): Ben => ({
  id: 'b', id_number: '1', full_name: 'פלוני', family_name: 'כהן', eligibility_status: 'pending', lineage_node_id: null, ...over,
})
const standing = (b: Ben) => lineageStanding(b, byId, approved)
const reason = (b: Ben) => reviewReasonOf(b, standing(b))

describe('lineageStanding', () => {
  it('מסלול מאושר כולו — נכד מאושר, גם כשהכרטסת עדיין ממתינה', () => {
    expect(standing(ben({ lineage_node_id: 'n6' })).standing).toBe('approved_descendant')
    expect(standing(ben({ lineage_node_id: 'p6', eligibility_status: 'approved' })).standing).toBe('approved_descendant')
  })

  it('צומת ממתין והכרטסת ממתינה — ממתין לאישור', () => {
    expect(standing(ben({ lineage_node_id: 'p6' })).standing).toBe('pending')
  })

  it('אב פסול במסלול — תלוי בפסילה, גם כשהכרטסת מאושרת והנכד מאושר בעץ', () => {
    const s = standing(ben({ lineage_node_id: 'r7', eligibility_status: 'approved' }))
    expect(s.standing).toBe('depends_on_rejection')
    expect(s.rejectedAt).toEqual({ id: 'r6', name: 'ראובן', generation: 6 })
  })

  it('כמה פסילות במסלול — המקור הוא הקרובה לשורש', () => {
    expect(standing(ben({ lineage_node_id: 'q7' })).rejectedAt?.id).toBe('q5')
  })

  it('הצומת של המשפחה עצמו פסול — תלוי בפסילה', () => {
    expect(standing(ben({ lineage_node_id: 'r6' })).rejectedAt?.id).toBe('r6')
  })

  it('המשפחה נדחתה — גובר על הכול', () => {
    expect(standing(ben({ lineage_node_id: 'r7', eligibility_status: 'rejected' })).standing).toBe('family_rejected')
  })

  it('ממצא בשער או בבדיקה מעמיקה — בבדיקה', () => {
    expect(standing(ben({ lineage_node_id: 'x6' })).standing).toBe('in_review')
    expect(standing(ben({ lineage_node_id: 'n6', eligibility_status: 'deep_review' })).standing).toBe('in_review')
  })

  it('צומת מנותק, או בלי שיוך לעץ — לא ניתן לקבוע', () => {
    expect(standing(ben({ lineage_node_id: 'o6' })).standing).toBe('undetermined')
    expect(standing(ben({ lineage_node_id: null })).standing).toBe('undetermined')
  })

  it('ביטול פסילה מחזיר את המשפחה — מחושב מחדש מהעץ, בלי כתיבה', () => {
    const fixed = new Map(byId)
    fixed.set('r6', { ...byId.get('r6')!, status: 'verified' })
    expect(lineageStanding(ben({ lineage_node_id: 'r7' }), fixed, approved).standing).toBe('approved_descendant')
  })
})

describe('reviewReasonOf — 12 הסיבות', () => {
  const dr = (over: Partial<Ben>) => ben({ eligibility_status: 'deep_review', ...over })

  it('1–6: ממצא בשער בתוך בדיקה מעמיקה', () => {
    expect(reason(dr({ lineage_node_id: 'x6' }))).toBe('not_in_ref')
    expect(reason(dr({ lineage_node_id: 'n3' }))).toBe('too_shallow')
    expect(reason(dr({ lineage_node_id: 'g7' }))).toBe('gen_gap')
    expect(reason(dr({ lineage_node_id: 'o6' }))).toBe('broken_node')
    // בלי צומת, ובשרשרת השמורה חסר דור 3
    const chain = [{ name: 'חתם סופר', generation: 1 }, { name: 'שמעון', generation: 2 }]
    expect(reason(dr({ lineage_node_id: null, lineage_chain: chain }))).toBe('no_node')
    expect(reason(dr({ lineage_node_id: null }))).toBe('no_lineage')
  })

  it('7: אב במסלול נפסל — בכל סטטוס חוץ מנדחה', () => {
    expect(reason(ben({ lineage_node_id: 'r7', eligibility_status: 'approved' }))).toBe('rejected_ancestor')
    expect(reason(dr({ lineage_node_id: 'r7' }))).toBe('rejected_ancestor')
  })

  it('8: הערה ידנית של המזכירות, והדורות תקינים', () => {
    expect(reason(dr({ lineage_node_id: 'n6', deep_review_reason: 'חסרה תעודת לידה' }))).toBe('secretary_note')
  })

  it('9: נכנסה כי השער לא הצליח לבדוק', () => {
    expect(reason(dr({ lineage_node_id: 'n6', deep_review_reason: 'סדר הדורות לא נבדק מול הקובץ המאושר (שגיאה)' }))).toBe('unchecked')
  })

  it('10: הסיבה שהשער רשם כבר לא קיימת', () => {
    expect(reason(dr({ lineage_node_id: 'n6', deep_review_reason: `${GAP_KIND_LABEL.not_in_ref}: דור 4` }))).toBe('reason_gone')
  })

  it('11: בבדיקה בלי סיבה', () => {
    expect(reason(dr({ lineage_node_id: 'n6', deep_review_reason: '  ' }))).toBe('stuck_no_reason')
  })

  it('12: פגומה ואינה בבדיקה מעמיקה', () => {
    expect(reason(ben({ lineage_node_id: 'x6', eligibility_status: 'approved' }))).toBe('missing_from_review')
  })

  it('תקינה ולא בבדיקה, או נדחתה — לא ברשימה', () => {
    expect(reason(ben({ lineage_node_id: 'n6' }))).toBeNull()
    expect(reason(ben({ lineage_node_id: 'x6', eligibility_status: 'rejected' }))).toBeNull()
  })

  it('לכל 12 הסיבות יש תווית', () => {
    expect(Object.keys(REVIEW_REASON_LABEL)).toHaveLength(12)
  })
})

describe('buildLineageReport', () => {
  it('סיכום לפי סיבה ומצב, וספירת טעויות מערכת', () => {
    const bens: Ben[] = [
      ben({ id: 'a', lineage_node_id: 'n6' }),                                                  // לא ברשימה
      ben({ id: 'b', lineage_node_id: 'r7', eligibility_status: 'approved', family_name: 'לוי', spouse_name: 'שרה' }),
      ben({ id: 'c', lineage_node_id: 'x6', eligibility_status: 'approved' }),                  // 12
      ben({ id: 'd', lineage_node_id: 'n6', eligibility_status: 'deep_review' }),               // 11
      ben({ id: 'e', lineage_node_id: 'x6', eligibility_status: 'deep_review' }),               // 1
    ]
    const r = buildLineageReport(bens, nodes, approved)
    expect(r.scanned).toBe(5)
    expect(r.total).toBe(4)
    expect(r.byReason).toEqual({ rejected_ancestor: 1, missing_from_review: 1, stuck_no_reason: 1, not_in_ref: 1 })
    expect(r.byStanding).toEqual({ approved_descendant: 1, depends_on_rejection: 1, in_review: 3 })
    expect(r.mistakes).toBe(2)
    expect(r.rows.filter(x => MISTAKE_REASONS.has(x.reason)).map(x => x.id)).toEqual(['c', 'd'])
    const b = r.rows.find(x => x.id === 'b')!
    expect(b).toMatchObject({ name: 'לוי פלוני ושרה', generation: 6, detail: 'ראובן', standing: 'depends_on_rejection' })
  })
})
