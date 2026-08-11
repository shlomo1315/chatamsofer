import { describe, it, expect } from 'vitest'
import { findSelfDuplicates, type SelfDupNode, type SelfDupBen } from './selfDuplicateNodes'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ כלי שמסמן צמתים למחיקה חייב להיות מוכח ולא מקורב. הבדיקות כאן נועלות את
// שני הדברים שאסור להם להישבר: שתי הראיות שנדרשות יחד, וההגנה על צומת שצבר
// ילדים או כרטסות. הן בנויות על המקרה האמיתי שדווח מהשטח.
// ─────────────────────────────────────────────────────────────────────────────

const node = (over: Partial<SelfDupNode> & { id: string }): SelfDupNode => ({
  name: 'צומת', parent_id: null, generation: 7, status: 'pending', id_number: null, ...over,
})

// המקרה מהשטח: בעץ נכתב "חנה רחל", בכרטסת נשמר "מנה רחל". אות אחת.
const KEEP = 'רבי שלמה ומרת חנה רחל עקשטיין'
const DUP = 'רבי שלמה ומרת מנה רחל עקשטיין'

const ben = (over: Partial<SelfDupBen> = {}): SelfDupBen => ({
  id: 'b1', id_number: '203207923', full_name: 'שלמה', spouse_name: 'מנה רחל',
  family_name: 'עקשטיין', gender: 'male', lineage_node_id: 'dup',
  lineage_chain: [{ generation: 7, name: KEEP }],
  ...over,
})

/** התרחיש הבסיסי: דור 7 הוא הנרשם, ומתחתיו דור 8 שהוא עותק שלו. */
function scenario(over: { nodes?: SelfDupNode[]; bens?: SelfDupBen[] } = {}) {
  const nodes = over.nodes ?? [
    node({ id: 'keep', name: KEEP, generation: 7, status: 'verified' }),
    node({ id: 'dup', name: DUP, parent_id: 'keep', generation: 8 }),
  ]
  return findSelfDuplicates(nodes, over.bens ?? [ben()])
}

describe('findSelfDuplicates — שתי הראיות', () => {
  it('מזהה נרשם שנתלה כילד של עצמו', () => {
    const scan = scenario()
    expect(scan.total).toBe(1)
    expect(scan.rows[0]).toMatchObject({
      benId: 'b1', dupNodeId: 'dup', keepNodeId: 'keep',
      dupGeneration: 8, keepGeneration: 7,
    })
  })

  it('הת"ז תסומן על צומת האב כשחסרה לו', () => {
    expect(scenario().rows[0].willCopyIdNumber).toBe(true)
  })

  it('לאב כבר יש ת"ז — לא מסמנים שוב', () => {
    const scan = scenario({
      nodes: [
        node({ id: 'keep', name: KEEP, generation: 7, id_number: '203207923' }),
        node({ id: 'dup', name: DUP, parent_id: 'keep', generation: 8 }),
      ],
    })
    expect(scan.rows[0].willCopyIdNumber).toBe(false)
  })

  it('🔴 בלי ראיה 1 — האב אינו הנרשם, לא נוגעים', () => {
    // נרשם תקין: אביו הוא אדם אחר, והוא עצמו יושב על הצומת שמתחתיו.
    // ⚠️ האיבר האחרון בשרשרת הוא *מקומו של הנרשם*, ולכן הוא הצומת שלו ולא
    // האב. שרשרת שמסתיימת בשם האב פירושה "האב הוא אני" — מצב אחר לגמרי.
    const scan = scenario({
      nodes: [
        node({ id: 'keep', name: 'רבי פסח ומרת טובה לוי', generation: 7 }),
        node({ id: 'dup', name: DUP, parent_id: 'keep', generation: 8 }),
      ],
      bens: [ben({ lineage_chain: [
        { generation: 7, name: 'רבי פסח ומרת טובה לוי' },
        { generation: 8, name: DUP },
      ] })],
    })
    expect(scan.total).toBe(0)
  })

  it('🔴 בלי ראיה 2 — הצומת אינו נושא את השם שהיוצר בונה, זה בן אמיתי', () => {
    // בן אמיתי ששמו דומה לאביו. מחיקה שלו הייתה מוחקת אדם.
    const scan = scenario({
      nodes: [
        node({ id: 'keep', name: KEEP, generation: 7 }),
        node({ id: 'dup', name: 'רבי יוסף ומרת לאה עקשטיין', parent_id: 'keep', generation: 8 }),
      ],
    })
    expect(scan.total).toBe(0)
  })

  it('נרשם בלי שיוך לעץ אינו נסרק', () => {
    expect(scenario({ bens: [ben({ lineage_node_id: null })] }).total).toBe(0)
  })

  it('צומת ללא אב אינו יכול להיות עותק של אביו', () => {
    const scan = scenario({
      nodes: [node({ id: 'dup', name: DUP, parent_id: null, generation: 8 })],
    })
    expect(scan.total).toBe(0)
  })

  it('הזיהוי עובד גם דרך השם המחושב, בלי שרשרת', () => {
    // הנרשם ואביו נושאים בדיוק את אותו שם — הסימן הראשון של nodeIsSelf.
    const scan = scenario({
      nodes: [
        node({ id: 'keep', name: DUP, generation: 7 }),
        node({ id: 'dup', name: DUP, parent_id: 'keep', generation: 8 }),
      ],
      bens: [ben({ lineage_chain: null })],
    })
    expect(scan.total).toBe(1)
  })
})

describe('🔴 findSelfDuplicates — מה שאסור לגעת בו', () => {
  it('צומת שצבר ילדים — מוגן, עם סיבה', () => {
    const scan = scenario({
      nodes: [
        node({ id: 'keep', name: KEEP, generation: 7 }),
        node({ id: 'dup', name: DUP, parent_id: 'keep', generation: 8 }),
        node({ id: 'kid', name: 'ילד', parent_id: 'dup', generation: 9 }),
      ],
    })
    expect(scan.total).toBe(0)
    expect(scan.blocked).toHaveLength(1)
    expect(scan.blocked[0].guard).toContain('ילדים')
  })

  it('צומת שמקושרות אליו עוד כרטסות — מוגן', () => {
    const scan = scenario({
      bens: [ben(), ben({ id: 'b2', id_number: '999999999', lineage_node_id: 'dup' })],
    })
    expect(scan.total).toBe(0)
    expect(scan.blocked[0].guard).toContain('כרטסות')
  })

  it('צומת מוגן אינו מופיע ברשימה הפעילה', () => {
    const scan = scenario({
      nodes: [
        node({ id: 'keep', name: KEEP, generation: 7 }),
        node({ id: 'dup', name: DUP, parent_id: 'keep', generation: 8 }),
        node({ id: 'kid', name: 'ילד', parent_id: 'dup', generation: 9 }),
      ],
    })
    expect(scan.rows.map(r => r.dupNodeId)).not.toContain('dup')
    expect(scan.blocked.map(r => r.dupNodeId)).toContain('dup')
  })
})

describe('findSelfDuplicates — סיכום', () => {
  it('סופר מה נסרק ומחזיר סך תואם', () => {
    const scan = scenario()
    expect(scan.scannedNodes).toBe(2)
    expect(scan.scannedBeneficiaries).toBe(1)
    expect(scan.total).toBe(scan.rows.length)
  })

  it('עץ ריק אינו נופל', () => {
    expect(findSelfDuplicates([], [])).toMatchObject({ total: 0, rows: [], blocked: [] })
  })
})
