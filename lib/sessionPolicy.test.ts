import { describe, it, expect, beforeAll } from 'vitest'
import {
  evaluateSession, makeSeenCookie, readSeenCookie, authTimeFromAccessToken,
  SESSION_MAX_MS, IDLE_MS, PROMPT_MS, IDLE_GRACE_MS, FRESH_LOGIN_MS,
} from './sessionPolicy'

beforeAll(() => { process.env.SESSION_COOKIE_SECRET = 'test-secret' })

const H = 60 * 60 * 1000
const now = Date.UTC(2026, 10, 8, 12, 0, 0)

function jwt(payload: object) {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256' })}.${b(payload)}.sig`
}

describe('authTimeFromAccessToken', () => {
  it('לוקח את זמן הכניסה האחרון מ-amr', () => {
    const t = jwt({ amr: [{ method: 'oauth', timestamp: 1000 }, { method: 'password', timestamp: 2000 }] })
    expect(authTimeFromAccessToken(t)).toBe(2_000_000)
  })
  it('null כשאין amr או שהטוקן פגום', () => {
    expect(authTimeFromAccessToken(jwt({ sub: 'x' }))).toBeNull()
    expect(authTimeFromAccessToken('garbage')).toBeNull()
    expect(authTimeFromAccessToken(undefined)).toBeNull()
  })
})

describe('עוגיית פעילות', () => {
  it('נקראת חזרה רק לאותו משתמש ובלי שינוי', () => {
    const c = makeSeenCookie('u1', now)
    expect(readSeenCookie(c, 'u1')).toBe(now)
    expect(readSeenCookie(c, 'u2')).toBeNull()
    const [uid, , sig] = c.split('.')
    expect(readSeenCookie(`${uid}.${now + H}.${sig}`, 'u1')).toBeNull()
    expect(readSeenCookie('', 'u1')).toBeNull()
  })
})

describe('evaluateSession', () => {
  it('מנתק אחרי 8 שעות מהכניסה, גם עם פעילות', () => {
    const v = evaluateSession({ now, authAt: now - SESSION_MAX_MS - 1, seenAt: now })
    expect(v).toEqual({ ok: false, reason: 'expired' })
  })
  it('בתוקף, ומחזיר מתי יפוג', () => {
    const v = evaluateSession({ now, authAt: now - 2 * H, seenAt: now - 60_000 })
    expect(v).toEqual({ ok: true, expiresAt: now + 6 * H, refreshSeen: false })
  })
  it('מנתק על חוסר פעילות מעבר לחלון + המונה + מרווח', () => {
    const limit = IDLE_MS + PROMPT_MS + IDLE_GRACE_MS
    expect(evaluateSession({ now, authAt: now - H, seenAt: now - limit + 1000 }).ok).toBe(true)
    expect(evaluateSession({ now, authAt: now - H, seenAt: now - limit - 1000 })).toEqual({ ok: false, reason: 'idle' })
  })
  it('כניסה טרייה בלי עוגייה: מאשר וכותב עוגייה', () => {
    const v = evaluateSession({ now, authAt: now - FRESH_LOGIN_MS + 1000, seenAt: null })
    expect(v).toMatchObject({ ok: true, refreshSeen: true })
  })
  it('עוגייה חסרה בסשן ישן: מנתק (מחיקת עוגייה לא עוקפת)', () => {
    expect(evaluateSession({ now, authAt: now - H, seenAt: null })).toEqual({ ok: false, reason: 'idle' })
  })
  it('בלי amr לא מנתקים על עוגייה חסרה (מונע לולאת ניתוקים)', () => {
    expect(evaluateSession({ now, authAt: null, seenAt: null })).toEqual({ ok: true, expiresAt: null, refreshSeen: true })
  })
})
