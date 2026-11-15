import { describe, it, expect, beforeAll } from 'vitest'
import { normalizeIsraeliId, normalizePhone, normalizeEmail, validateRegister, validateClaim } from './validate'
import { hashValue, encryptValue, decryptValue, maskId, generateCode, hashCode, codesEqual, issueSession, verifySession } from './crypto'
import { filterClaims, computeCounters, type AdminClaim } from './adminData'
import { suggestedAmount } from './settings'

beforeAll(() => { process.env.MATCHMAKER_SECRET = 'test-secret' })

const REG = { first_name: 'דוד', last_name: 'כהן', id_number: '000000018', phone: '050-1234567', email: 'A@b.co', address: 'הרצל 1', city: 'בני ברק', birth_date: '1980-05-01' }
const CLAIM = {
  match_date: '2026-10-01', groom_first_name: 'יוסף', groom_last_name: 'לוי', groom_id: '000000018', groom_phone: '',
  bride_first_name: 'שרה', bride_last_name: 'כץ', bride_id: '000000026', bride_phone: '',
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
    expect(validateClaim({ ...CLAIM, bride_id: CLAIM.groom_id }, new Date('2026-11-15')).ok).toBe(false)
    expect(validateClaim({ ...CLAIM, is_grandchild: true }, new Date('2026-11-15')).ok).toBe(false)
    const g = validateClaim({ ...CLAIM, is_grandchild: true, grandchild_side: 'both' }, new Date('2026-11-15'))
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
    id: 'x', match_date: '2026-10-01', created_at: '2026-11-01T10:00:00Z', groom_name: 'א', groom_id_masked: '', groom_father_name: null, groom_phone: null,
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
    const s = { regular_amount: 500, enlarged_amount: 900, max_claims_per_matchmaker: null }
    expect(suggestedAmount(s, false)).toBe(500)
    expect(suggestedAmount(s, true)).toBe(900)
    expect(suggestedAmount({ ...s, regular_amount: null }, false)).toBe(null)
  })
})
