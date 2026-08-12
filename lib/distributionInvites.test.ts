import { describe, it, expect } from 'vitest'
import {
  checkInvite, newInviteToken, inviteExpiry, INVITE_MESSAGE, MAX_INVITE_DAYS,
  type InviteRow,
} from './distributionInvites'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ הקישור הזה עוקף מתג סגירה. כל כשל כאן פירושו דלת שנשארת פתוחה — ולכן
// הבדיקות נעולות בעיקר על הצד המחמיר: מה *אינו* תקף.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-12T10:00:00Z')
const invite = (over: Partial<InviteRow> = {}): InviteRow => ({
  token: 'abc', distribution_id: 'D1', beneficiary_id: 'B1',
  expires_at: '2026-08-20T10:00:00Z', used_at: null, revoked_at: null, ...over,
})

describe('checkInvite — מה תקף', () => {
  it('הזמנה טרייה תקפה', () => {
    expect(checkInvite(invite(), NOW)).toEqual({ ok: true })
  })

  it('תקפה גם כשמצוינת החלוקה הנכונה', () => {
    expect(checkInvite(invite(), NOW, 'D1')).toEqual({ ok: true })
  })
})

describe('🔴 checkInvite — מה אינו תקף', () => {
  it('טוקן שאינו קיים', () => {
    expect(checkInvite(null, NOW)).toEqual({ ok: false, reason: 'not-found' })
    expect(checkInvite(undefined, NOW)).toEqual({ ok: false, reason: 'not-found' })
  })

  it('🔴 כבר נוצל — זו כל מהות החד-פעמיות', () => {
    const v = checkInvite(invite({ used_at: '2026-08-12T09:00:00Z' }), NOW)
    expect(v).toEqual({ ok: false, reason: 'used' })
  })

  it('בוטל', () => {
    expect(checkInvite(invite({ revoked_at: '2026-08-11T10:00:00Z' }), NOW))
      .toEqual({ ok: false, reason: 'revoked' })
  })

  it('פג תוקף', () => {
    expect(checkInvite(invite({ expires_at: '2026-08-12T09:59:59Z' }), NOW))
      .toEqual({ ok: false, reason: 'expired' })
  })

  it('תפוגה בדיוק עכשיו נחשבת פגה', () => {
    expect(checkInvite(invite({ expires_at: NOW.toISOString() }), NOW))
      .toEqual({ ok: false, reason: 'expired' })
  })

  it('🔴 תאריך תפוגה פגום נחשב פג ולא תקף', () => {
    // ברירת מחדל לטובת הפותח הייתה הופכת שורה פגומה לקישור נצחי.
    expect(checkInvite(invite({ expires_at: 'לא תאריך' }), NOW))
      .toEqual({ ok: false, reason: 'expired' })
    expect(checkInvite(invite({ expires_at: '' }), NOW))
      .toEqual({ ok: false, reason: 'expired' })
  })

  it('🔴 קישור מחלוקה אחרת אינו משמש לחלוקה הנוכחית', () => {
    // אחרת קישור שנשלח בפסח היה נפתח לרישום לתשרי.
    expect(checkInvite(invite({ distribution_id: 'D1' }), NOW, 'D2'))
      .toEqual({ ok: false, reason: 'wrong-distribution' })
  })
})

describe('סדר הבדיקות — מה נאמר למשפחה', () => {
  it('🔴 "כבר נוצל" גובר על "פג תוקף"', () => {
    // משפחה שנרשמה בהצלחה ולוחצת שוב צריכה לשמוע שהרישום נקלט — לא
    // ש"הקישור פג", שנשמע ככישלון ומייצר פנייה טלפונית מיותרת.
    const v = checkInvite(invite({ used_at: '2026-08-11T10:00:00Z', expires_at: '2026-08-11T10:00:00Z' }), NOW)
    expect(v).toEqual({ ok: false, reason: 'used' })
  })

  it('"כבר נוצל" גובר גם על ביטול', () => {
    const v = checkInvite(invite({ used_at: '2026-08-11T10:00:00Z', revoked_at: '2026-08-11T11:00:00Z' }), NOW)
    expect(v).toEqual({ ok: false, reason: 'used' })
  })

  it('לכל סיבה יש הודעה משלה', () => {
    for (const reason of ['not-found', 'used', 'expired', 'revoked', 'wrong-distribution'] as const) {
      expect(INVITE_MESSAGE[reason]).toBeTruthy()
    }
    // ההודעה על "נוצל" אינה מנוסחת ככישלון.
    expect(INVITE_MESSAGE.used).toContain('נקלט')
  })
})

describe('newInviteToken — הטוקן הוא ההרשאה', () => {
  it('128 ביט אקראיות, hex', () => {
    const t = newInviteToken()
    expect(t).toHaveLength(32)
    expect(t).toMatch(/^[0-9a-f]{32}$/)
  })

  it('🔴 אינו חוזר על עצמו', () => {
    const set = new Set(Array.from({ length: 200 }, () => newInviteToken()))
    expect(set.size).toBe(200)
  })
})

describe('inviteExpiry — תפוגה חובה ומוגבלת', () => {
  it('מוסיף את מספר הימים המבוקש', () => {
    expect(inviteExpiry(NOW, 7)).toBe('2026-08-19T10:00:00.000Z')
  })

  it('🔴 חסום בתקרה — קישור נצחי הוא חור קבוע במתג הסגירה', () => {
    const capped = new Date(inviteExpiry(NOW, 9999)).getTime() - NOW.getTime()
    expect(capped).toBe(MAX_INVITE_DAYS * 24 * 60 * 60 * 1000)
  })

  it('ערך לא תקין נופל ליום אחד ולא לנצח', () => {
    for (const v of [0, -5, NaN]) {
      const ms = new Date(inviteExpiry(NOW, v)).getTime() - NOW.getTime()
      expect(ms).toBe(24 * 60 * 60 * 1000)
    }
  })
})
