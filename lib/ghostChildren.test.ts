import { describe, it, expect } from 'vitest'
import {
  findGhostChildren, normalizeIdNumber, containedInName, looksLikeChildName,
  type GhostNodeRow, type GhostBenRow,
} from './ghostChildren'

const node = (over: Partial<GhostNodeRow> & { id: string }): GhostNodeRow => ({
  name: 'צומת', parent_id: null, generation: 7, status: 'pending', id_number: null, ...over,
})

const ben = (over: Partial<GhostBenRow> & { id: string }): GhostBenRow => ({
  full_name: 'ישראל', family_name: 'שרייבר', spouse_name: null,
  id_number: null, spouse_id_number: null, lineage_node_id: null, children: null, ...over,
})

// התרחיש הבסיסי: אב עם כרטסת שבשדה הילדים שלה ת"ז אחת, וצומת עם אותה ת"ז תחתיו.
function scenario(over: { childId?: string; nodeId?: string; extraNodes?: GhostNodeRow[]; extraBens?: GhostBenRow[] } = {}) {
  const childId = over.childId ?? '123456789'
  const nodes = [
    node({ id: 'p', name: 'רבי אברהם שרייבר', generation: 6 }),
    node({ id: over.nodeId ?? 'g', name: 'משה', parent_id: 'p', generation: 7, id_number: childId }),
    ...(over.extraNodes ?? []),
  ]
  const bens = [
    ben({ id: 'card-parent', lineage_node_id: 'p', children: [{ name: 'משה', id_number: childId }] }),
    ...(over.extraBens ?? []),
  ]
  return findGhostChildren(nodes, bens)
}

describe('normalizeIdNumber', () => {
  it('משאיר ספרות בלבד', () => {
    expect(normalizeIdNumber('12-345 6789')).toBe('123456789')
    expect(normalizeIdNumber(123456789)).toBe('123456789')
  })

  it('פוסל ערך קצר מדי — שורת ילד חלקית אינה מזוהה כת"ז', () => {
    expect(normalizeIdNumber('12')).toBe('')
    expect(normalizeIdNumber('-')).toBe('')
    expect(normalizeIdNumber(null)).toBe('')
    expect(normalizeIdNumber(undefined)).toBe('')
  })
})

describe('findGhostChildren — התנאי המזהה', () => {
  it('מזהה צומת עם ת"ז שמופיעה בשדה הילדים של כרטסת ההורה', () => {
    const scan = scenario()
    expect(scan.total).toBe(1)
    expect(scan.rows[0].nodeId).toBe('g')
    expect(scan.rows[0].parentBenId).toBe('card-parent')
    expect(scan.rows[0].childNameInCard).toBe('משה')
  })

  it('צומת בלי ת"ז אינו נספר גם כשההורה מכיל ילדים', () => {
    const nodes = [
      node({ id: 'p' }),
      node({ id: 'g', parent_id: 'p', id_number: null }),
    ]
    const bens = [ben({ id: 'c', lineage_node_id: 'p', children: [{ name: 'משה', id_number: '123456789' }] })]
    expect(findGhostChildren(nodes, bens).total).toBe(0)
  })

  it('ת"ז שאינה בשדה הילדים של ההורה אינה נספרת', () => {
    expect(scenario({ nodeId: 'g' }).total).toBe(1)
    const nodes = [
      node({ id: 'p' }),
      node({ id: 'g', parent_id: 'p', id_number: '999999999' }),
    ]
    const bens = [ben({ id: 'c', lineage_node_id: 'p', children: [{ name: 'משה', id_number: '123456789' }] })]
    expect(findGhostChildren(nodes, bens).total).toBe(0)
  })

  it('ת"ז שמופיעה בכרטסת של הורה *אחר* אינה הופכת את הצומת לרפאים', () => {
    const nodes = [
      node({ id: 'p' }),
      node({ id: 'other' }),
      node({ id: 'g', parent_id: 'p', id_number: '123456789' }),
    ]
    const bens = [ben({ id: 'c', lineage_node_id: 'other', children: [{ name: 'משה', id_number: '123456789' }] })]
    expect(findGhostChildren(nodes, bens).total).toBe(0)
  })

  it('כרטסת בלי שיוך לצומת אינה משמשת כ"כרטסת ההורה"', () => {
    const nodes = [
      node({ id: 'p' }),
      node({ id: 'g', parent_id: 'p', id_number: '123456789' }),
    ]
    const bens = [ben({ id: 'c', lineage_node_id: null, children: [{ name: 'משה', id_number: '123456789' }] })]
    expect(findGhostChildren(nodes, bens).total).toBe(0)
  })

  it('הנרמול מגשר על ניסוח שונה של אותה ת"ז בצומת ובכרטסת', () => {
    const nodes = [
      node({ id: 'p' }),
      node({ id: 'g', parent_id: 'p', id_number: '123456789' }),
    ]
    const bens = [ben({ id: 'c', lineage_node_id: 'p', children: [{ name: 'משה', id_number: '12-345/6789' }] })]
    expect(findGhostChildren(nodes, bens).total).toBe(1)
  })

  it('children שאינו מערך אינו מפיל את הסריקה', () => {
    const nodes = [node({ id: 'p' }), node({ id: 'g', parent_id: 'p', id_number: '123456789' })]
    for (const children of [null, undefined, {}, 'לא מערך', 5]) {
      expect(findGhostChildren(nodes, [ben({ id: 'c', lineage_node_id: 'p', children })]).total).toBe(0)
    }
  })
})

describe('findGhostChildren — הסייגים', () => {
  it('צומת שיש לו ילדים בעץ אינו נכלל, ונספר בנפרד', () => {
    const scan = scenario({ extraNodes: [node({ id: 'kid', parent_id: 'g', generation: 8 })] })
    expect(scan.total).toBe(0)
    expect(scan.skipped.withChildren).toBe(1)
    expect(scan.skipped.withCard).toBe(0)
  })

  it('צומת שיש לו כרטסת מקושרת אינו נכלל, ונספר בנפרד', () => {
    const scan = scenario({ extraBens: [ben({ id: 'own', lineage_node_id: 'g', id_number: '123456789' })] })
    expect(scan.total).toBe(0)
    expect(scan.skipped.withCard).toBe(1)
    expect(scan.skipped.withChildren).toBe(0)
  })

  it('כרטסת מקושרת חוסמת גם כשהת"ז שלה שונה מזו של הצומת', () => {
    const scan = scenario({ extraBens: [ben({ id: 'own', lineage_node_id: 'g', id_number: '555555555' })] })
    expect(scan.total).toBe(0)
    expect(scan.skipped.withCard).toBe(1)
  })
})

describe('findGhostChildren — שלוש הקבוצות', () => {
  it('no_card — אין שום כרטסת עם הת"ז', () => {
    const scan = scenario()
    expect(scan.rows[0].group).toBe('no_card')
    expect(scan.rows[0].cardBenId).toBeNull()
    expect(scan.rows[0].cardNodeId).toBeNull()
    expect(scan.counts).toEqual({ no_card: 1, card_unlinked: 0, card_elsewhere: 0 })
  })

  it('card_unlinked — יש כרטסת עם הת"ז ואינה משויכת לצומת', () => {
    const scan = scenario({ extraBens: [ben({ id: 'his', id_number: '123456789', lineage_node_id: null })] })
    expect(scan.rows[0].group).toBe('card_unlinked')
    expect(scan.rows[0].cardBenId).toBe('his')
    expect(scan.rows[0].cardNodeId).toBeNull()
  })

  it('card_elsewhere — הכרטסת כבר משויכת לצומת אחר', () => {
    const scan = scenario({
      extraNodes: [node({ id: 'real', name: 'רבי משה שרייבר', parent_id: 'p' })],
      extraBens: [ben({ id: 'his', id_number: '123456789', lineage_node_id: 'real' })],
    })
    expect(scan.rows[0].group).toBe('card_elsewhere')
    expect(scan.rows[0].cardBenId).toBe('his')
    expect(scan.rows[0].cardNodeId).toBe('real')
  })

  it('ת"ז של אשה בכרטסת נחשבת כרטסת קיימת', () => {
    const scan = scenario({ extraBens: [ben({ id: 'hers', spouse_id_number: '123456789' })] })
    expect(scan.rows[0].group).toBe('card_unlinked')
    expect(scan.rows[0].cardBenId).toBe('hers')
  })

  it('כרטסת משויכת גוברת על כרטסת לא-משויכת של אותו אדם', () => {
    const scan = scenario({
      extraNodes: [node({ id: 'real', parent_id: 'p' })],
      extraBens: [
        ben({ id: 'loose', id_number: '123456789', lineage_node_id: null }),
        ben({ id: 'linked', id_number: '123456789', lineage_node_id: 'real' }),
      ],
    })
    expect(scan.rows[0].group).toBe('card_elsewhere')
    expect(scan.rows[0].cardBenId).toBe('linked')
  })
})

describe('findGhostChildren — סיכום ומיון', () => {
  it('סופר את שלוש הקבוצות ומחזיר סך הכל תואם', () => {
    const nodes = [
      node({ id: 'p', generation: 6 }),
      node({ id: 'real', parent_id: 'p', generation: 7 }),
      node({ id: 'a', name: 'א', parent_id: 'p', generation: 7, id_number: '111111111' }),
      node({ id: 'b', name: 'ב', parent_id: 'p', generation: 7, id_number: '222222222' }),
      node({ id: 'c', name: 'ג', parent_id: 'p', generation: 7, id_number: '333333333' }),
    ]
    const bens = [
      ben({ id: 'parent-card', lineage_node_id: 'p', children: [
        { name: 'א', id_number: '111111111' },
        { name: 'ב', id_number: '222222222' },
        { name: 'ג', id_number: '333333333' },
      ] }),
      ben({ id: 'b-card', id_number: '222222222', lineage_node_id: null }),
      ben({ id: 'c-card', id_number: '333333333', lineage_node_id: 'real' }),
    ]
    const scan = findGhostChildren(nodes, bens)
    expect(scan.counts).toEqual({ no_card: 1, card_unlinked: 1, card_elsewhere: 1 })
    expect(scan.total).toBe(3)
    expect(scan.scannedNodes).toBe(5)
    expect(scan.scannedBeneficiaries).toBe(3)
  })

  it('ממוין לפי דור ואז לפי שם ההורה', () => {
    const nodes = [
      node({ id: 'p1', name: 'ב־הורה', generation: 6 }),
      node({ id: 'p2', name: 'א־הורה', generation: 6 }),
      node({ id: 'x', name: 'ילד', parent_id: 'p1', generation: 9, id_number: '111111111' }),
      node({ id: 'y', name: 'ילד', parent_id: 'p2', generation: 7, id_number: '222222222' }),
      node({ id: 'z', name: 'ילד', parent_id: 'p1', generation: 7, id_number: '333333333' }),
    ]
    const bens = [
      ben({ id: 'c1', lineage_node_id: 'p1', children: [
        { name: 'ילד', id_number: '111111111' }, { name: 'ילד', id_number: '333333333' }] }),
      ben({ id: 'c2', lineage_node_id: 'p2', children: [{ name: 'ילד', id_number: '222222222' }] }),
    ]
    const scan = findGhostChildren(nodes, bens)
    expect(scan.rows.map(r => r.nodeId)).toEqual(['y', 'z', 'x'])
  })

  it('עץ ריק מחזיר סריקה ריקה ולא נופל', () => {
    const scan = findGhostChildren([], [])
    expect(scan).toMatchObject({ total: 0, counts: { no_card: 0, card_unlinked: 0, card_elsewhere: 0 } })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ציר התאום — הבדיקות שהגיעו עם לוגיקת הכלת-השם, ונשמרו במלואן.
// ⚠️ כלי שמסמן צמתים כעותקים חייב להיות מוכח ולא מקורב. הבדיקות כאן נועלות
// את שני הדברים שאסור להם להישבר: ההוכחה (ת"ז מכרטסת ההורה), וההגנה על צומת
// שצבר ילדים או כרטסת.
// ─────────────────────────────────────────────────────────────────────────────

describe('הכלה בשם', () => {
  it('שם פרטי מוכל בניסוח המלא', () => {
    expect(containedInName('רחל לאה מרים', 'רבי דוד ומרת רחל לאה מרים סינצבנג')).toBe(true)
  })

  it('🔴 "חנה" אינו "חנה רחל" — שתי נשים שונות', () => {
    // השוואת מילים ולא מחרוזת. אילו הושוותה מחרוזת, סימון כעותק היה נופל על אדם אחר.
    expect(containedInName('חנה רחל', 'רבי X ומרת חנה Y')).toBe(false)
  })

  it('שם זהה אינו "מוכל" — אין מה למזג לתוך עצמו', () => {
    expect(containedInName('משה', 'משה')).toBe(false)
  })

  it('רווחים כפולים אינם משנים את התוצאה', () => {
    expect(containedInName('  רחל   לאה ', 'רבי דוד ומרת רחל לאה סינצבנג')).toBe(true)
  })

  it('זיהוי שם בסגנון שדה הילדים', () => {
    expect(looksLikeChildName('חנה רחל')).toBe(true)
    expect(looksLikeChildName('רבי דוד ומרת חנה רחל לוי')).toBe(false)
    expect(looksLikeChildName('')).toBe(false)
  })
})

describe('findGhostChildren — ציר התאום', () => {
  it('אח שהשם המלא שלו מכיל את שמו → מסומן כתאום', () => {
    const scan = scenario({
      nodeId: 'g',
      extraNodes: [node({ id: 'twin', name: 'רבי דוד ומרת משה סינצבנג', parent_id: 'p', generation: 7 })],
    })
    expect(scan.rows[0].twinNodeId).toBe('twin')
    expect(scan.rows[0].twinName).toBe('רבי דוד ומרת משה סינצבנג')
  })

  it('בלי אח מתאים — אין תאום, והשורה עדיין מדווחת', () => {
    const scan = scenario()
    expect(scan.total).toBe(1)
    expect(scan.rows[0].twinNodeId).toBeNull()
    expect(scan.rows[0].twinName).toBeNull()
  })

  it('🔴 התאום מחפש באחים בלבד — צומת בענף אחר אינו תאום', () => {
    const scan = scenario({
      extraNodes: [
        node({ id: 'elsewhere-parent', name: 'הורה אחר', generation: 6 }),
        node({ id: 'far', name: 'רבי דוד ומרת משה סינצבנג', parent_id: 'elsewhere-parent', generation: 7 }),
      ],
    })
    expect(scan.rows[0].twinNodeId).toBeNull()
  })

  it('התאום אינו מחליף את הסיווג — שני הצירים מדווחים יחד', () => {
    const scan = scenario({
      extraNodes: [node({ id: 'twin', name: 'רבי דוד ומרת משה סינצבנג', parent_id: 'p', generation: 7 })],
      extraBens: [ben({ id: 'his', id_number: '123456789', lineage_node_id: null })],
    })
    expect(scan.rows[0].group).toBe('card_unlinked')
    expect(scan.rows[0].twinNodeId).toBe('twin')
  })

  it('nameLooksLikeChildRow מסמן שם בסגנון שדה הילדים', () => {
    expect(scenario().rows[0].nameLooksLikeChildRow).toBe(true)
    const full = scenario({ nodeId: 'g' })
    expect(full.rows[0].nodeName).toBe('משה')
  })
})

describe('🔴 findGhostChildren — מה שאסור לגעת בו', () => {
  it('צומת עם כרטסת מקושרת — מוגן, עם סיבה', () => {
    const scan = scenario({ extraBens: [ben({ id: 'own', lineage_node_id: 'g', id_number: '123456789' })] })
    expect(scan.total).toBe(0)
    expect(scan.protectedRows).toHaveLength(1)
    expect(scan.protectedRows[0].nodeId).toBe('g')
    expect(scan.protectedRows[0].guard).toContain('כרטסת')
  })

  it('צומת שצבר ילדים — מוגן, גם כשהוא כפילות מובהקת', () => {
    // מישהו נרשם והתחבר אליו מאז. טיפול בו היה מנתק רשומות אמיתיות.
    const scan = scenario({
      extraNodes: [
        node({ id: 'twin', name: 'רבי דוד ומרת משה סינצבנג', parent_id: 'p', generation: 7 }),
        node({ id: 'kid', name: 'ילד', parent_id: 'g', generation: 8 }),
      ],
    })
    expect(scan.total).toBe(0)
    expect(scan.protectedRows[0].guard).toContain('ילדים')
  })

  it('כשיש גם כרטסת וגם ילדים — הכרטסת היא הסיבה המדווחת', () => {
    const scan = scenario({
      extraNodes: [node({ id: 'kid', parent_id: 'g', generation: 8 })],
      extraBens: [ben({ id: 'own', lineage_node_id: 'g' })],
    })
    expect(scan.skipped).toEqual({ withCard: 1, withChildren: 0 })
    expect(scan.protectedRows[0].guard).toContain('כרטסת')
  })

  it('צומת מוגן אינו מופיע ברשימה הפעילה', () => {
    const scan = scenario({ extraNodes: [node({ id: 'kid', parent_id: 'g', generation: 8 })] })
    expect(scan.rows.map(r => r.nodeId)).not.toContain('g')
    expect(scan.protectedRows.map(r => r.nodeId)).toContain('g')
  })
})
