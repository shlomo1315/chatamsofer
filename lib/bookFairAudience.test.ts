import { describe, it, expect } from 'vitest'
import { buildAudience, type ReminderRow, type OrderRow } from './bookFairAudience'

const rem = (email: string, over: Partial<ReminderRow> = {}): ReminderRow => ({
  email, created_at: '2026-09-01T10:00:00Z', notified_at: null, ...over,
})

const ord = (email: string | null, over: Partial<OrderRow> = {}): OrderRow => ({
  customer_email: email,
  customer_name: 'ישראל ישראלי',
  status: 'paid',
  total_agorot: 10000,
  refunded_agorot: 0,
  created_at: '2026-09-05T10:00:00Z',
  ...over,
})

describe('buildAudience', () => {
  it('מחזיר רשימה ריקה כשאין נתונים', () => {
    expect(buildAudience([], [])).toEqual([])
  })

  it('כולל נרשמי תזכורת', () => {
    const out = buildAudience([rem('a@b.com')], [])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ email: 'a@b.com', source: 'reminder', orders: 0 })
  })

  it('כולל רוכשים', () => {
    const out = buildAudience([], [ord('c@d.com')])
    expect(out[0]).toMatchObject({ email: 'c@d.com', source: 'customer', orders: 1, spentAgorot: 10000 })
  })

  // 🔴 הלב של המודול: אדם אחד = שורה אחת.
  it('מאחד כתובת שמופיעה בשני המקורות לשורה אחת', () => {
    const out = buildAudience([rem('x@y.com')], [ord('x@y.com')])
    expect(out).toHaveLength(1)
    expect(out[0].source).toBe('both')
    expect(out[0].orders).toBe(1)
  })

  it('מאחד גם כשהאותיות שונות ברישיות', () => {
    const out = buildAudience([rem('X@Y.com')], [ord('x@y.COM')])
    expect(out).toHaveLength(1)
    expect(out[0].email).toBe('x@y.com')
    expect(out[0].source).toBe('both')
  })

  it('מאחד תווי כיווניות נסתרים לאותה כתובת', () => {
    const out = buildAudience([rem('‏x@y.com')], [ord('x@y.com')])
    expect(out).toHaveLength(1)
    expect(out[0].source).toBe('both')
  })

  it('סוכם כמה הזמנות ואת הסכום נטו', () => {
    const out = buildAudience([], [
      ord('a@b.com', { total_agorot: 10000 }),
      ord('a@b.com', { total_agorot: 5000, refunded_agorot: 2000 }),
    ])
    expect(out[0].orders).toBe(2)
    expect(out[0].spentAgorot).toBe(13000)
  })

  // ⚠️ הזמנה שננטשה אינה הופכת אדם ללקוח.
  it('מדלג על הזמנות שלא שולמו', () => {
    const out = buildAudience([], [
      ord('a@b.com', { status: 'pending' }),
      ord('c@d.com', { status: 'cancelled' }),
      ord('e@f.com', { status: 'failed' }),
    ])
    expect(out).toEqual([])
  })

  it('מסנן כתובות פסולות משני המקורות', () => {
    const out = buildAudience(
      [rem('שבור'), rem('a@b')],
      [ord('גם@שבור'), ord(null), ord('')],
    )
    expect(out).toEqual([])
  })

  it('לוקח את התאריך המוקדם כ"מאז"', () => {
    const out = buildAudience(
      [rem('a@b.com', { created_at: '2026-09-10T00:00:00Z' })],
      [ord('a@b.com', { created_at: '2026-09-02T00:00:00Z' })],
    )
    expect(out[0].since).toBe('2026-09-02T00:00:00Z')
  })

  it('משלים שם מהזמנה לנרשם שהגיע בלי שם', () => {
    const out = buildAudience([rem('a@b.com')], [ord('a@b.com', { customer_name: 'משה כהן' })])
    expect(out[0].name).toBe('משה כהן')
  })

  it('אינו דורס שם קיים בהזמנה מאוחרת', () => {
    const out = buildAudience([], [
      ord('a@b.com', { customer_name: 'ראשון' }),
      ord('a@b.com', { customer_name: 'שני' }),
    ])
    expect(out[0].name).toBe('ראשון')
  })

  it('שומר על notified_at של הנרשם', () => {
    const out = buildAudience([rem('a@b.com', { notified_at: '2026-10-03T22:00:00Z' })], [])
    expect(out[0].notifiedAt).toBe('2026-10-03T22:00:00Z')
  })

  it('ממיין יורד — החדשים ראשונים', () => {
    const out = buildAudience([
      rem('old@b.com', { created_at: '2026-08-01T00:00:00Z' }),
      rem('new@b.com', { created_at: '2026-09-20T00:00:00Z' }),
    ], [])
    expect(out.map(m => m.email)).toEqual(['new@b.com', 'old@b.com'])
  })
})
