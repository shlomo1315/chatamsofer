import { describe, it, expect } from 'vitest'
import { scopeBookNotice, cleanPhone, cleanEmail, DEFAULT_PHONE_MESSAGE, noticeAudience, type NoticeOrder } from './bookFairBookNotice'

const o = (n: string, phone: string | null, email: string | null, name = 'כהן'): NoticeOrder => ({
  order_number: n, customer_name: name, customer_phone: phone, customer_email: email, tracking_token: `t${n}`, total_agorot: 1000,
})

describe('scopeBookNotice', () => {
  it('מקבץ לפי מייל ולפי טלפון — נמען אחד לכמה הזמנות', () => {
    const s = scopeBookNotice([
      o('1', '050-1234567', 'A@x.com'),
      o('2', '0501234567', 'a@x.com'),
      o('3', '+972 52 7654321', null),
    ])
    expect(s.orders).toBe(3)
    expect(s.email).toHaveLength(1)
    expect(s.email[0].orders.map(x => x.orderNumber)).toEqual(['1', '2'])
    expect(s.phone.map(p => p.key)).toEqual(['0501234567', '0527654321'])
    expect(s.phoneOnly).toBe(1)
    expect(s.emailOnly).toBe(0)
  })

  it('מי שאין לו מייל תקין וטלפון תקין — ברשימת "בלי פרטי קשר"', () => {
    const s = scopeBookNotice([o('9', '123', 'not-an-email')])
    expect(s.email).toHaveLength(0)
    expect(s.phone).toHaveLength(0)
    expect(s.noContact.map(x => x.orderNumber)).toEqual(['9'])
  })

  it('מי שכבר קיבל לא נכלל שוב', () => {
    const s = scopeBookNotice(
      [o('1', '0501234567', 'a@x.com'), o('2', '0539999999', 'b@x.com')],
      { email: new Set(['a@x.com']), phone: new Set(['0539999999']) },
    )
    expect(s.email.map(e => e.key)).toEqual(['b@x.com'])
    expect(s.phone.map(p => p.key)).toEqual(['0501234567'])
  })
})

describe('עזרים', () => {
  it('cleanPhone / cleanEmail', () => {
    expect(cleanPhone('03-6181234')).toBe('036181234')
    expect(cleanPhone('12345')).toBeNull()
    expect(cleanEmail(' X@Y.CO.IL ')).toBe('x@y.co.il')
    expect(cleanEmail('x@y')).toBeNull()
  })

  it('טקסט הטלפון בלי פסיקים ובלי נקודות (ימות קוטעת בהם)', () => {
    const t = DEFAULT_PHONE_MESSAGE('חוט המשולש "מהדורה"')
    expect(t).not.toMatch(/[.,"]/)
    expect(t).toContain('חוט המשולש')
  })

  it('קהל נפרד לכל ספר ולכל ערוץ', () => {
    expect(noticeAudience('b1', 'phone')).toBe('book_notice:b1:phone')
  })
})
