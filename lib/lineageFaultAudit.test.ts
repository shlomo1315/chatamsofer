import { describe, it, expect } from 'vitest'
import { buildApprovedRefTree } from './lineageApprovedRef'
import { auditFaultRecipient } from './lineageFaultAudit'
import type { RecheckBen } from './deepReviewRecheck'
import type { GapNode } from './deepReviewGaps'

// בירור הנמענים של מייל "תקלה בסדר הדורות": המצב ברגע השליחה, באותו שער.

const approved = buildApprovedRefTree([
  { key: 'r1', name: 'חתם סופר', generation: 1, parent_key: null },
  { key: 'r2', name: 'שמעון', generation: 2, parent_key: 'r1' },
  { key: 'r3', name: 'יוסף', generation: 3, parent_key: 'r2' },
  { key: 'r4', name: 'משה', generation: 4, parent_key: 'r3' },
  { key: 'r5', name: 'אביגדור', generation: 5, parent_key: 'r4' },
])
const byId = new Map<string, GapNode>([
  { id: 'n1', name: 'מרן החתם סופר זי"ע', parent_id: null, generation: 1 },
  { id: 'n2', name: 'שמעון', parent_id: 'n1', generation: 2 },
  { id: 'n3', name: 'יוסף', parent_id: 'n2', generation: 3 },
  { id: 'n4', name: 'משה', parent_id: 'n3', generation: 4 },
  { id: 'n5', name: 'אביגדור', parent_id: 'n4', generation: 5 },
  { id: 'x4', name: 'בנימין', parent_id: 'n3', generation: 4 },
  { id: 'y5', name: 'אביגדור', parent_id: 'x4', generation: 5 },
].map(n => [n.id, n]))

const ben = (node: string, status: string, reason: string | null = null): RecheckBen => ({
  id: 'b', id_number: null, full_name: 'גילה', family_name: 'פויפר', eligibility_status: status,
  lineage_node_id: node, lineage_chain: null, lineage_manual: null, deep_review_reason: reason,
})
const run = (b: RecheckBen, extra: { applied?: string; released?: string | null } = {}) => auditFaultRecipient({
  ben: b,
  applied: extra.applied ? { before: { chain: null, node_id: extra.applied } } : null,
  released: 'released' in extra ? { prevReason: extra.released ?? null } : null,
}, byId, approved)

describe('auditFaultRecipient', () => {
  it('שוחררה בבדיקה מחדש בלי שתיקנה: נשלח בטעות', () => {
    expect(run(ben('n5', 'pending'), { released: 'דור 2–5 אינו בקובץ המאושר (דור 4: בנימין)' }).group).toBe('wrong_chain_ok')
  })

  it('הסדירה בקישור משרשרת שגויה: נשלח בצדק', () => {
    expect(run(ben('n5', 'pending'), { applied: 'y5' }).group).toBe('justified')
  })

  it('הסדירה בקישור, אבל השרשרת הייתה תקינה כבר בשליחה: נשלח בטעות', () => {
    expect(run(ben('n5', 'pending'), { applied: 'n5' }).group).toBe('wrong_chain_ok')
  })

  it('עדיין בבדיקה מעמיקה עם שרשרת שגויה: נשלח בצדק', () => {
    expect(run(ben('y5', 'deep_review')).group).toBe('justified')
  })

  it('בבדיקה מעמיקה מסיבה שהמזכירות רשמה: נשלח בטעות', () => {
    expect(run(ben('y5', 'deep_review', 'חסר אישור רב קהילה')).group).toBe('wrong_other_reason')
  })

  it('הסטטוס שונה ידנית אחרי השליחה: לא ברור', () => {
    expect(run(ben('n5', 'approved')).group).toBe('unclear')
  })
})
