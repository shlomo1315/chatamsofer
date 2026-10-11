import { describe, it, expect } from 'vitest'
import { findSiblingDuplicates, wifeName, pairKey } from './lineageDupGroups'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 כלל אחד לזיהוי כפילויות בעץ (12.10) — בין *אחים* בלבד (אותו הורה), לפי
// בעל + שם משפחה. הרמה קובעת מי רשאי להכריע:
//   A — זהה אחרי נרמול ("ומרת" מול "ו")          → כל בעל הרשאת עריכה
//   B — אישה חסרה בצד אחד                          → כל בעל הרשאת עריכה
//   C — שם אישה חלקי ("רחל" מול "חוה רחל")          → מנהל בלבד
//   D — שני שמות אישה שונים (כתיב או נישואים שניים) → מנהל בלבד
//   + בן/חתן סותרים                                 → מנהל בלבד
// ─────────────────────────────────────────────────────────────────────────────

const n = (id: string, name: string, extra: Partial<{ parent_id: string; status: string; relation: string | null; generation: number }> = {}) =>
  ({ id, name, parent_id: 'P', status: 'pending', relation: null, generation: 5, ...extra })

describe('wifeName', () => {
  it('"ומרת" ו"ו" — אותה אישה', () => {
    expect(wifeName('רבי משה ומרת מלכה פריי')).toBe('מלכה')
    expect(wifeName('רבי משה ומלכה פריי')).toBe('מלכה')
  })
  it('בלי אישה', () => expect(wifeName('רבי משה פריי')).toBe(''))
  it('שם בעל כפול — האישה אחרי הו׳', () => expect(wifeName('רבי יצחק צבי ורויזא פריי')).toBe('רויזא'))
})

describe('findSiblingDuplicates', () => {
  it('A — זהה אחרי נרמול', () => {
    const g = findSiblingDuplicates([n('1', 'רבי דוד והינדל שישא'), n('2', 'רבי דוד ומרת הינדל שישא')])
    expect(g).toHaveLength(1)
    expect(g[0].level).toBe('A')
    expect(g[0].adminOnly).toBe(false)
  })
  it('B — אישה חסרה בצד אחד', () => {
    const g = findSiblingDuplicates([n('1', 'רבי יוסף ברנפלד'), n('2', 'רבי יוסף ומרת שרל ברנפלד')])
    expect(g[0].level).toBe('B')
    expect(g[0].adminOnly).toBe(false)
  })
  it('C — שם אישה חלקי ⇒ מנהל בלבד', () => {
    const g = findSiblingDuplicates([n('1', 'רבי אברהם שמואל בנימין ורחל פריי'), n('2', 'רבי אברהם שמואל בנימין ומרת חוה רחל פריי')])
    expect(g[0].level).toBe('C')
    expect(g[0].adminOnly).toBe(true)
  })
  it('D — שתי נשים שונות ⇒ מנהל בלבד', () => {
    const g = findSiblingDuplicates([n('1', 'רבי גרשון ומרת לאה אולמן'), n('2', 'רבי גרשון ומרת נחמה רוחמה אולמן')])
    expect(g[0].level).toBe('D')
    expect(g[0].adminOnly).toBe(true)
  })
  it('בן מול חתן ⇒ מנהל בלבד גם ברמה A', () => {
    const g = findSiblingDuplicates([n('1', 'רבי שמחה ואלישבע דנציגר', { relation: 'son' }), n('2', 'רבי שמחה ומרת אלישבע דנציגר', { relation: 'son_in_law' })])
    expect(g[0].level).toBe('A')
    expect(g[0].relationConflict).toBe(true)
    expect(g[0].adminOnly).toBe(true)
  })
  it('🔴 הורים שונים — לעולם לא כפילות (נכד ע"ש סבא)', () => {
    expect(findSiblingDuplicates([n('1', 'רבי משה פריי', { parent_id: 'P1' }), n('2', 'רבי משה פריי', { parent_id: 'P2' })])).toEqual([])
  })
  it('שם משפחה שונה — לא כפילות', () => {
    expect(findSiblingDuplicates([n('1', 'רבי משה פריי'), n('2', 'רבי משה סופר')])).toEqual([])
  })
  it('נדחה (rejected) אינו משתתף', () => {
    expect(findSiblingDuplicates([n('1', 'רבי משה פריי'), n('2', 'רבי משה פריי', { status: 'rejected' })])).toEqual([])
  })
  it('זוג שסומן "לא כפול" — לא חוזר', () => {
    const nodes = [n('1', 'רבי יוסף ברנפלד'), n('2', 'רבי יוסף ומרת שרל ברנפלד')]
    expect(findSiblingDuplicates(nodes, new Set([pairKey('1', '2')]))).toEqual([])
  })
  it('השם המוצע — המלא, עם האישה', () => {
    const g = findSiblingDuplicates([n('1', 'רבי יוסף ברנפלד', { status: 'verified' }), n('2', 'רבי יוסף ומרת שרל ברנפלד')])
    expect(g[0].suggestedName).toBe('רבי יוסף ומרת שרל ברנפלד')
  })
  it('השורד — מאושר קודם', () => {
    const g = findSiblingDuplicates([n('1', 'רבי יוסף ברנפלד'), n('2', 'רבי יוסף ומרת שרל ברנפלד', { status: 'verified' })])
    expect(g[0].keepId).toBe('2')
  })
})
