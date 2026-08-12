import { describe, it, expect } from 'vitest'
import {
  checkInvite, newInviteToken, inviteExpiry, normalizeExpiry, INVITE_MESSAGE, MAX_INVITE_DAYS,
  type InviteRow,
} from './distributionInvites'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ הקישור הזה עוקף מתג סגירה, והזמן הוא ההגבלה *היחידה* עליו — הוא אינו
// חד-פעמי ואינו נעול למשפחה. לכן כל כשל בבדיקת התוקף פירושו דלת שנשארת
// פתוחה, והבדיקות כאן נעולות בעיקר על הצד המחמיר: מה *אינו* תקף.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-12T10:00:00Z')
const invite = (over: Partial<InviteRow> = {}): InviteRow => ({
  token: 'abc', distribution_id: 'D1',
  expires_at: '2026-08-20T10:00:00Z', starts_at: null, revoked_at: null, ...over,
})

describe('checkInvite — מה תקף', () => {
  it('קישור בתוך החלון תקף', () => {
    expect(checkInvite(invite(), NOW)).toEqual({ ok: true })
  })

  it('תקף גם כשמצוינת החלוקה הנכונה', () => {
    expect(checkInvite(invite(), NOW, 'D1')).toEqual({ ok: true })
  })

  it('🔴 תקף שוב ושוב — הקישור אינו חד-פעמי', () => {
    // קישור אחד נשלח לקבוצת משפחות, וכל אחת נרשמת דרכו. אין כאן ניצול.
    const row = invite()
    for (let i = 0; i < 5; i++) expect(checkInvite(row, NOW)).toEqual({ ok: true })
  })
})

describe('🔴 checkInvite — מה אינו תקף', () => {
  it('טוקן שאינו קיים', () => {
    expect(checkInvite(null, NOW)).toEqual({ ok: false, reason: 'not-found' })
    expect(checkInvite(undefined, NOW)).toEqual({ ok: false, reason: 'not-found' })
  })

  it('בוטל', () => {
    expect(checkInvite(invite({ revoked_at: '2026-08-11T10:00:00Z' }), NOW))
      .toEqual({ ok: false, reason: 'revoked' })
  })

  it('🔴 פג תוקף — זו ההגנה היחידה על הקישור', () => {
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

describe('חלון פתיחה מושהה', () => {
  it('טרם נפתח', () => {
    expect(checkInvite(invite({ starts_at: '2026-08-13T10:00:00Z' }), NOW))
      .toEqual({ ok: false, reason: 'not-started' })
  })

  it('נפתח בדיוק עכשיו — תקף', () => {
    expect(checkInvite(invite({ starts_at: NOW.toISOString() }), NOW)).toEqual({ ok: true })
  })

  it('בלי מועד התחלה תקף מיד', () => {
    expect(checkInvite(invite({ starts_at: null }), NOW)).toEqual({ ok: true })
  })

  it('מועד התחלה פגום אינו חוסם — התפוגה כבר שומרת', () => {
    expect(checkInvite(invite({ starts_at: 'לא תאריך' }), NOW)).toEqual({ ok: true })
  })
})

describe('סדר הבדיקות — מה נאמר למשפחה', () => {
  it('🔴 ביטול גובר על הכול', () => {
    const v = checkInvite(invite({ revoked_at: '2026-08-11T10:00:00Z', expires_at: '2026-08-01T10:00:00Z' }), NOW)
    expect(v).toEqual({ ok: false, reason: 'revoked' })
  })

  it('"פג תוקף" גובר על "טרם נפתח"', () => {
    // שורה שגם פגה וגם טרם נפתחה היא שורה שגויה — נכון לומר שהיא פגה,
    // כי זה המצב שאין ממנו דרך חזרה.
    const v = checkInvite(invite({ expires_at: '2026-08-01T10:00:00Z', starts_at: '2026-08-30T10:00:00Z' }), NOW)
    expect(v).toEqual({ ok: false, reason: 'expired' })
  })

  it('לכל סיבה יש הודעה משלה', () => {
    for (const reason of ['not-found', 'expired', 'not-started', 'revoked', 'wrong-distribution'] as const) {
      expect(INVITE_MESSAGE[reason]).toBeTruthy()
    }
  })
})

describe('newInviteToken — הטוקן הוא מה שפותח את הרישום', () => {
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

describe('normalizeExpiry — מועד שהמנהל הגדיר ידנית', () => {
  it('מקבל תאריך עתידי תקין', () => {
    const r = normalizeExpiry('2026-08-15T12:00:00Z', NOW)
    expect(r).toEqual({ ok: true, iso: '2026-08-15T12:00:00.000Z' })
  })

  it('🔴 דוחה תאריך בעבר ולא "מתקן" בשקט', () => {
    // מנהל שהקליד תאריך שגוי צריך לדעת, ולא לגלות שהקישור כבר פג.
    const r = normalizeExpiry('2026-08-01T12:00:00Z', NOW)
    expect(r.ok).toBe(false)
  })

  it('דוחה תאריך פגום', () => {
    expect(normalizeExpiry('לא תאריך', NOW).ok).toBe(false)
    expect(normalizeExpiry('', NOW).ok).toBe(false)
  })

  it('🔴 דוחה מעבר לתקרה', () => {
    const far = new Date(NOW.getTime() + (MAX_INVITE_DAYS + 1) * 86400000).toISOString()
    const r = normalizeExpiry(far, NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(String(MAX_INVITE_DAYS))
  })
})
