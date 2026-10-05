import { describe, it, expect, beforeAll } from 'vitest'
import {
  parseDashConfig, hashDashPassword, dashPasswordMatches, makeDashToken, dashTokenValid,
  DASH_TTL_MS, type DashConfig,
} from './bookFairDashboard'

beforeAll(() => { process.env.OTP_NONCE_SECRET = 'test-secret-for-dashboard' })

const cfg = (p: Partial<DashConfig> = {}): DashConfig => ({
  password_hash: hashDashPassword('correct-horse')!, enabled: true, version: 3,
  updated_at: null, last_login_at: null, ...p,
})

describe('parseDashConfig', () => {
  it('🔴 ערך חסר/פגום ⇒ כבוי (נכשל-סגור)', () => {
    expect(parseDashConfig(null).enabled).toBe(false)
    expect(parseDashConfig('[object Object]').enabled).toBe(false)
    expect(parseDashConfig('{"enabled":"yes"}').enabled).toBe(false)
  })
  it('ערך תקין', () => {
    const c = parseDashConfig('{"password_hash":"abc","enabled":true,"version":4}')
    expect(c).toMatchObject({ password_hash: 'abc', enabled: true, version: 4 })
  })
})

describe('סיסמה', () => {
  it('תואמת / לא תואמת', () => {
    const h = hashDashPassword('correct-horse')!
    expect(dashPasswordMatches('correct-horse', h)).toBe(true)
    expect(dashPasswordMatches('wrong', h)).toBe(false)
    expect(dashPasswordMatches('', h)).toBe(false)
  })
  it('🔴 גיבוב הדוכן אינו פותח את הלוח (תחום חתימה נפרד)', () => {
    // אותה סיסמה, תחום אחר — אסור שגיבוב אחד יאומת כשני.
    const h = hashDashPassword('same-pass')!
    expect(dashPasswordMatches('same-pass', h)).toBe(true)
    expect(h).not.toBe('')
  })
})

describe('🔴 אסימון', () => {
  const now = 1_800_000_000_000
  it('תקף', () => {
    expect(dashTokenValid(makeDashToken(3, now), cfg(), now + 1000)).toBe(true)
  })
  it('🔴 גרסה ישנה (אחרי החלפת סיסמה / ניתוק) ⇒ נפסל', () => {
    expect(dashTokenValid(makeDashToken(2, now), cfg(), now + 1000)).toBe(false)
  })
  it('🔴 פג תוקף ⇒ נפסל', () => {
    expect(dashTokenValid(makeDashToken(3, now), cfg(), now + DASH_TTL_MS + 1)).toBe(false)
  })
  it('🔴 זיוף — שינוי התפוגה או הגרסה ⇒ נפסל', () => {
    const [exp, ver, sig] = makeDashToken(3, now)!.split(':')
    expect(dashTokenValid(`${Number(exp) + 999999999}:${ver}:${sig}`, cfg(), now)).toBe(false)
    expect(dashTokenValid(`${exp}:4:${sig}`, cfg({ version: 4 }), now)).toBe(false)
  })
  it('🔴 לוח כבוי / בלי סיסמה ⇒ נפסל גם עם אסימון תקין', () => {
    const t = makeDashToken(3, now)
    expect(dashTokenValid(t, cfg({ enabled: false }), now)).toBe(false)
    expect(dashTokenValid(t, cfg({ password_hash: '' }), now)).toBe(false)
  })
  it('זבל ⇒ נפסל', () => {
    expect(dashTokenValid('', cfg(), now)).toBe(false)
    expect(dashTokenValid('a:b', cfg(), now)).toBe(false)
    expect(dashTokenValid(undefined, cfg(), now)).toBe(false)
  })
})
