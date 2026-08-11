import { describe, it, expect } from 'vitest'
import { findGhostChildren, containedInName, looksLikeChildName, type GhostNode } from './ghostChildren'

// ⚠️ כלי שמסמן צמתים למחיקה חייב להיות מוכח, לא מקורב. הבדיקות כאן נועלות את
// שני הדברים שאסור להם להישבר: ההוכחה (ת"ז מכרטסת ההורה), וההגנה על צומת
// שצבר ילדים או כרטסת.

const n = (o: Partial<GhostNode> & { id: string; name: string }): GhostNode =>
  ({ parent_id: 'P', generation: 8, status: 'verified', id_number: null, ...o })

describe('הכלה בשם', () => {
  it('שם פרטי מוכל בניסוח המלא', () => {
    expect(containedInName('רחל לאה מרים', 'רבי דוד ומרת רחל לאה מרים סינצבנג')).toBe(true)
  })

  it('🔴 "חנה" אינו "חנה רחל" — שתי נשים שונות', () => {
    // השוואת מילים ולא מחרוזת. אילו הושוותה מחרוזת, מחיקה הייתה מסירה אדם אחר.
    expect(containedInName('חנה רחל', 'רבי X ומרת חנה Y')).toBe(false)
  })

  it('שם זהה אינו "מוכל" — אין מה למזג לתוך עצמו', () => {
    expect(containedInName('משה', 'משה')).toBe(false)
  })

  it('זיהוי שם בסגנון שדה הילדים', () => {
    expect(looksLikeChildName('חנה רחל')).toBe(true)
    expect(looksLikeChildName('רבי דוד ומרת חנה רחל לוי')).toBe(false)
  })
})

describe('זיהוי בהוכחה', () => {
  const proof = new Map([['P', new Set(['123456782'])]])

  it('צומת שת"ז שלו בשדה הילדים של ההורה, בלי כרטסת — מזוהה', () => {
    const rows = findGhostChildren([n({ id: 'G', name: 'חנה רחל', id_number: '123456782' })], [], proof)
    expect(rows).toHaveLength(1)
    expect(rows[0].group).toBe('unapproved')
  })

  it('🔴 בלי ההוכחה — לא נוגעים', () => {
    // אותו צומת בדיוק, אבל הת"ז אינה בשדה הילדים של ההורה.
    const rows = findGhostChildren([n({ id: 'G', name: 'חנה רחל', id_number: '999999999' })], [], proof)
    expect(rows).toHaveLength(0)
  })

  it('צומת בלי ת"ז אינו נסרק כלל', () => {
    expect(findGhostChildren([n({ id: 'G', name: 'חנה רחל' })], [], proof)).toHaveLength(0)
  })

  it('יש אח בשם מלא שמכיל אותו → כפילות', () => {
    const rows = findGhostChildren([
      n({ id: 'G', name: 'רחל לאה מרים', id_number: '123456782' }),
      n({ id: 'S', name: 'רבי דוד ומרת רחל לאה מרים סינצבנג' }),
    ], [], proof)
    expect(rows[0].group).toBe('duplicate')
    expect(rows[0].twinName).toBe('רבי דוד ומרת רחל לאה מרים סינצבנג')
  })
})

describe('🔴 מה שאסור לגעת בו', () => {
  const proof = new Map([['P', new Set(['123456782'])]])

  it('צומת עם כרטסת מקושרת — מוגן', () => {
    const rows = findGhostChildren(
      [n({ id: 'G', name: 'חנה רחל', id_number: '123456782' })],
      [{ id: 'b1', lineage_node_id: 'G' }],
      proof,
    )
    expect(rows[0].group).toBe('protected')
    expect(rows[0].guard).toContain('כרטסת')
  })

  it('צומת שצבר ילדים — מוגן, גם אם הוא כפילות מובהקת', () => {
    // מישהו נרשם והתחבר אליו מאז. מחיקה הייתה מנתקת רשומות אמיתיות.
    const rows = findGhostChildren([
      n({ id: 'G', name: 'רחל לאה מרים', id_number: '123456782' }),
      n({ id: 'S', name: 'רבי דוד ומרת רחל לאה מרים סינצבנג' }),
      n({ id: 'K', name: 'ילד', parent_id: 'G' }),
    ], [], proof)
    const g = rows.find(r => r.id === 'G')!
    expect(g.group).toBe('protected')
    expect(g.guard).toContain('ילדים')
  })
})
