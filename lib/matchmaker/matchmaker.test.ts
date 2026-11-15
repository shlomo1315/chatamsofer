import { describe, it, expect, beforeAll } from 'vitest'
import { normalizeIsraeliId, normalizePhone, normalizeEmail, validateRegister, validateClaim, validateBank, pairKey, claimsOpenDate } from './validate'
import { hashValue, encryptValue, decryptValue, maskId, generateCode, hashCode, codesEqual, issueSession, verifySession } from './crypto'
import { filterClaims, computeCounters, type AdminClaim } from './adminData'
import { suggestedAmount, effectiveLimit } from './settings'

beforeAll(() => { process.env.MATCHMAKER_SECRET = 'test-secret' })

const REG = { first_name: 'דוד', last_name: 'כהן', id_number: '000000018', phone: '050-1234567', email: 'A@b.co', address: 'הרצל 1', city: 'בני ברק', birth_date: '1980-05-01', circle: 'גור', bank_name: 'לאומי', bank_branch: '800', bank_account: '123456' }
const side = (p: string, f: string, l: string) => ({
  [`${p}_first_name`]: f, [`${p}_last_name`]: l, [`${p}_father_name`]: 'אב', [`${p}_father_phone`]: '0501111111',
  [`${p}_mother_name`]: 'אם', [`${p}_mother_phone`]: '0502222222', [`${p}_address`]: 'רחוב 1', [`${p}_circle`]: 'גור',
})
const CLAIM: Record<string, unknown> = {
  match_date: '2026-10-01', ...side('groom', 'יוסף', 'לוי'), ...side('bride', 'שרה', 'כץ'), single_matchmaker: true,
}

describe('אימות קלט', () => {
  it('ת"ז: ספרת ביקורת וריפוד', () => {
    expect(normalizeIsraeliId('18')).toBe(null) // קצר מדי
    expect(normalizeIsraeliId('000000018')).toBe('000000018')
    expect(normalizeIsraeliId('000000019')).toBe(null)
    expect(normalizeIsraeliId('abc')).toBe(null)
  })
  it('טלפון ומייל', () => {
    expect(normalizePhone('050-123 4567')).toBe('0501234567')
    expect(normalizePhone('+972501234567')).toBe('0501234567')
    expect(normalizePhone('123')).toBe(null)
    expect(normalizeEmail(' A@B.co ')).toBe('a@b.co')
    expect(normalizeEmail('bad')).toBe(null)
  })
  it('הרשמה תקינה ודחיית תאריך לא סביר', () => {
    const ok = validateRegister(REG)
    expect(ok.ok).toBe(true)
    expect(validateRegister({ ...REG, birth_date: '2025-01-01' }).ok).toBe(false)
    expect(validateRegister({ ...REG, id_number: '123' }).ok).toBe(false)
  })
  it('שאלון: חתן וכלה זהים נדחים, נכד חייב צד', () => {
    expect(validateClaim(CLAIM, new Date('2026-11-15')).ok).toBe(true)
    expect(validateClaim({ ...CLAIM, is_grandchild: true, grandchild_side: 'both', groom_id: '000000018', bride_id: '000000018' }, new Date('2026-11-15')).ok).toBe(false)
    expect(validateClaim({ ...CLAIM, is_grandchild: true }, new Date('2026-11-15')).ok).toBe(false)
    const g = validateClaim({ ...CLAIM, is_grandchild: true, grandchild_side: 'both', groom_id: '000000018', bride_id: '000000026' }, new Date('2026-11-15'))
    expect(g.ok && g.value.grandchild_side).toBe('both')
  })
})

describe('הצפנה וסשן', () => {
  it('הצפנה הפיכה, גיבוב יציב והסתרה חלקית', () => {
    const enc = encryptValue('000000018')
    expect(enc).not.toContain('000000018')
    expect(decryptValue(enc)).toBe('000000018')
    expect(hashValue('1')).toBe(hashValue('1'))
    expect(hashValue('1')).not.toBe(hashValue('2'))
    expect(maskId('000000018')).toBe('*****0018')
  })
  it('קוד כניסה: 6 ספרות והשוואה בטוחה', () => {
    const c = generateCode()
    expect(c).toMatch(/^\d{6}$/)
    expect(codesEqual(hashCode('m1', c), hashCode('m1', c))).toBe(true)
    expect(codesEqual(hashCode('m1', c), hashCode('m2', c))).toBe(false)
  })
  it('סשן: תקף 30 דקות ונדחה אחרי פקיעה או שינוי', () => {
    const t = Date.now()
    const s = issueSession('m1', t)
    expect(verifySession(s, t + 29 * 60_000)).toBe('m1')
    expect(verifySession(s, t + 31 * 60_000)).toBe(null)
    expect(verifySession(s.slice(0, -2) + 'xx', t)).toBe(null)
    expect(verifySession(undefined)).toBe(null)
  })
})

function claim(p: Partial<AdminClaim>): AdminClaim {
  return {
    id: 'x', match_date: '2026-10-01', created_at: '2026-11-01T10:00:00Z', groom_name: 'א', groom_id_masked: null, groom_father_name: null, groom_phone: null,
    bride_name: 'ב', bride_id_masked: '', bride_father_name: null, bride_phone: null, is_grandchild: false, grandchild_side: null, verification: null,
    status: 'pending', amount: null, reject_reason: null, handled_by: null, handled_at: null, paid_at: null,
    matchmaker: { id: 'm1', name: 'שדכן', phone: '050', email: 'a@b.co', city: 'ב' }, ...p,
  }
}

describe('ניהול', () => {
  const rows = [
    claim({ id: '1', status: 'approved', amount: 1000 }),
    claim({ id: '2', status: 'paid', amount: 2000, is_grandchild: true, verification: { result: 'verified', checked_at: '', matches: [] } }),
    claim({ id: '3', is_grandchild: true, verification: { result: 'not_found', checked_at: '', matches: [] }, created_at: '2026-12-01T00:00:00Z' }),
  ]
  it('מונים: סה"כ לתשלום רק מאושרות שלא שולמו', () => {
    expect(computeCounters(rows)).toEqual({ pending: 1, approved: 2, grandchildren: 2, payable: 1000 })
  })
  it('סינונים', () => {
    expect(filterClaims(rows, { grandchild: 'verified' }).map(r => r.id)).toEqual(['2'])
    expect(filterClaims(rows, { grandchild: 'not_found' }).map(r => r.id)).toEqual(['3'])
    expect(filterClaims(rows, { from: '2026-11-15' }).map(r => r.id)).toEqual(['3'])
    expect(filterClaims(rows, { status: 'paid' })).toHaveLength(1)
  })
  it('סכום מוצע לפי הגדרות', () => {
    const s = { regular_amount: 500, enlarged_amount: 900, max_claims_per_matchmaker: null, claims_open_from: null, claim_wait_days: 7 }
    expect(suggestedAmount(s, false)).toBe(500)
    expect(suggestedAmount(s, true)).toBe(900)
    expect(suggestedAmount({ ...s, regular_amount: null }, false)).toBe(null)
  })
})

describe('שאלון מורחב', () => {
  const now = new Date('2026-11-15')
  it('ת"ז לא נדרשת בלי סימון צאצא, ונדרשת רק לצד שסומן', () => {
    const r = validateClaim(CLAIM, now)
    expect(r.ok && r.value.groom.id).toBe(null)
    expect(validateClaim({ ...CLAIM, is_grandchild: true, grandchild_side: 'groom' }, now).ok).toBe(false)
    const g = validateClaim({ ...CLAIM, is_grandchild: true, grandchild_side: 'groom', groom_id: '000000018' }, now)
    expect(g.ok && g.value.groom.id).toBe('000000018')
    expect(g.ok && g.value.bride.id).toBe(null)
  })
  it('אב ואם נדרשים, ויתום פטור מפרטי ההורים', () => {
    expect(validateClaim({ ...CLAIM, groom_mother_name: '' }, now).ok).toBe(false)
    const noMother = { ...CLAIM, groom_mother_name: '', groom_mother_phone: '' }
    expect(validateClaim(noMother, now).ok).toBe(false)
    expect(validateClaim({ ...noMother, reasons: { orphan: 'groom' } }, now).ok).toBe(true)
    expect(validateClaim({ ...CLAIM, reasons: { orphan: 'x' } }, now).ok).toBe(false)
  })
  it('שדכן נוסף נדרש כשלא שדכן יחיד', () => {
    expect(validateClaim({ ...CLAIM, single_matchmaker: false }, now).ok).toBe(false)
    const sm = { first_name: 'משה', last_name: 'גרין', id_number: '000000026', phone: '0503333333', email: 'm@g.co', address: 'א 1', city: 'ב"ב', circle: 'גור' }
    const r = validateClaim({ ...CLAIM, single_matchmaker: false, second_matchmaker: sm }, now)
    expect(r.ok && r.value.second_matchmaker?.last_name).toBe('גרין')
  })
  it('סיבות: זיוו"ש לשני הצדדים', () => {
    const r = validateClaim({ ...CLAIM, reasons: { zivush_groom: true, zivush_bride: true, medical: true } }, now)
    expect(r.ok && r.value.reasons).toMatchObject({ zivush_groom: true, zivush_bride: true, medical: true, orphan: null })
  })
  it('מפתח כפילות לפי שמות', () => {
    const a = validateClaim(CLAIM, now), b = validateClaim({ ...CLAIM, groom_first_name: '  יוסף ' }, now)
    expect(a.ok && b.ok && pairKey(a.value)).toBe(a.ok && b.ok && pairKey(b.value))
  })
})

describe('בנק, המתנה והגבלה', () => {
  it('פרטי בנק', () => {
    expect(validateBank({ bank_name: 'לאומי', bank_branch: '800', bank_account: '123456' }).ok).toBe(true)
    expect(validateBank({ bank_name: 'לאומי', bank_branch: '8', bank_account: '123456' }).ok).toBe(false)
    expect(validateBank({ bank_name: '', bank_branch: '800', bank_account: '123456' }).ok).toBe(false)
    expect(validateRegister({ ...REG, bank_account: '' }).ok).toBe(false)
  })
  it('מועד פתיחה: המאוחר מבין ההרשמה + 7 ימים וה׳ בטבת', () => {
    expect(claimsOpenDate('2026-11-15T10:00:00Z', 7, null)).toBe('2026-12-15')
    expect(claimsOpenDate('2026-12-20T10:00:00Z', 7, null)).toBe('2026-12-27')
    expect(claimsOpenDate('2026-11-15T10:00:00Z', 7, '2026-11-01')).toBe('2026-11-22')
  })
  it('הגבלה פרטנית גוברת על הכללית', () => {
    const s = { regular_amount: null, enlarged_amount: null, max_claims_per_matchmaker: 3, claims_open_from: null, claim_wait_days: 7 }
    expect(effectiveLimit(s, null)).toBe(3)
    expect(effectiveLimit(s, 10)).toBe(10)
    expect(effectiveLimit(s, 0)).toBe(0)
    expect(effectiveLimit({ ...s, max_claims_per_matchmaker: null }, undefined)).toBe(null)
  })
})
