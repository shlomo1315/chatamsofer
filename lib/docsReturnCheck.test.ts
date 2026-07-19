import { describe, it, expect } from 'vitest'
import { isFixComplete, requiredDocKeys, type DocsReturnState } from './docsReturnCheck'

const base: DocsReturnState = {
  eligibility_status: 'docs_pending',
  required_docs: 'id_husband,id_wife',
  lineage_fix_required: false,
  lineage_fixed_at: null,
}

describe('requiredDocKeys', () => {
  it('מפרק רשימה מופרדת בפסיקים ומתעלם מרווחים וערכים ריקים', () => {
    expect(requiredDocKeys('id_husband, id_wife ,,')).toEqual(['id_husband', 'id_wife'])
    expect(requiredDocKeys('')).toEqual([])
    expect(requiredDocKeys(null)).toEqual([])
  })
})

describe('isFixComplete', () => {
  it('לא הושלם כשחסר מסמך נדרש', () => {
    expect(isFixComplete(base, ['id_husband'])).toBe(false)
  })

  it('הושלם כשכל המסמכים קיימים ולא נדרש תיקון דורות', () => {
    expect(isFixComplete(base, ['id_husband', 'id_wife'])).toBe(true)
  })

  it('מסמכים עודפים לא מפריעים', () => {
    expect(isFixComplete(base, ['id_husband', 'id_wife', 'other'])).toBe(true)
  })

  it('לא הושלם כשנדרש תיקון דורות שטרם הוגש', () => {
    expect(isFixComplete({ ...base, lineage_fix_required: true }, ['id_husband', 'id_wife'])).toBe(false)
  })

  it('הושלם כשנדרש תיקון דורות והוגש', () => {
    expect(isFixComplete(
      { ...base, lineage_fix_required: true, lineage_fixed_at: '2026-07-19T10:00:00Z' },
      ['id_husband', 'id_wife'],
    )).toBe(true)
  })

  it('בקשת תיקון דורות בלבד (בלי מסמכים) — הושלם רק אחרי הגשת התיקון', () => {
    const only: DocsReturnState = { ...base, required_docs: '', lineage_fix_required: true }
    expect(isFixComplete(only, [])).toBe(false)
    expect(isFixComplete({ ...only, lineage_fixed_at: '2026-07-19T10:00:00Z' }, [])).toBe(true)
  })

  it('לא רץ על סטטוס שאינו docs_pending', () => {
    expect(isFixComplete({ ...base, eligibility_status: 'pending' }, ['id_husband', 'id_wife'])).toBe(false)
    expect(isFixComplete({ ...base, eligibility_status: 'docs_returned' }, ['id_husband', 'id_wife'])).toBe(false)
  })
})
