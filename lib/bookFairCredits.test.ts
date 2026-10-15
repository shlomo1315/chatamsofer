import { describe, it, expect } from 'vitest'
import {
  parseCreditsTable, validateBank, creditPhoneTurn, buildCreditEmailHtml, amountSpoken,
  CR_OK, CR_HOLDER, CR_BANK, CR_BRANCH, CR_ACCT, CR_CONFIRM,
} from './bookFairCredits'

const head = ['שם', 'טלפון', 'מייל', 'ספרים', 'סכום']

describe('parseCreditsTable', () => {
  it('מפרסר שורות תקינות וקובע ערוץ', () => {
    const r = parseCreditsTable([head,
      ['דוד', '0501234567', '', 'שו"ת א', 45.5],
      ['משה', '', 'a@b.co', 'שו"ת ב', '30'],
    ])
    expect(r.errors).toEqual([])
    expect(r.credits.map(c => [c.channel, c.amount_agorot])).toEqual([['phone', 4550], ['email', 3000]])
  })
  it('דוחה סכום, טלפון ומייל לא תקינים ושורות כפולות', () => {
    const r = parseCreditsTable([head,
      ['', '0501234567', '', 'ספר', 'abc'],
      ['', '123', '', 'ספר', 10],
      ['', '', 'bad', 'ספר', 10],
      ['', '0501234567', '', 'ספר', 10],
      ['', '0501234567', '', 'ספר', 10],
      ['', '0501234568', '', '', 10],
    ])
    expect(r.errors).toHaveLength(5)
    expect(r.credits).toHaveLength(1)
  })
  it('מדווח על עמודות חסרות', () => {
    expect(parseCreditsTable([['שם']]).missingColumns.length).toBeGreaterThan(0)
  })
})

describe('validateBank', () => {
  it('מאשר פרטים תקינים ודוחה לא תקינים', () => {
    expect(validateBank({ bank: '12', branch: '345', account: '123456' })).toBeNull()
    expect(validateBank({ bank: '123', branch: '345', account: '123456' })).not.toBeNull()
    expect(validateBank({ bank: '12', branch: '34', account: '123456' })).not.toBeNull()
    expect(validateBank({ bank: '12', branch: '345', account: '12' })).not.toBeNull()
  })
})

describe('creditPhoneTurn', () => {
  const ctx = { name: 'דוד', books: 'שו"ת א', amountAgorot: 4550, alreadyDone: false }
  it('הפנייה הראשונה מקריאה ספרים וסכום ורושמת מענה', () => {
    const t = creditPhoneTurn({}, ctx)
    expect(t.reply).toContain('read=')
    expect(t.reply).toContain('45 שקלים')
    expect(t.action).toEqual({ kind: 'answered' })
  })
  it('הקשה 2 מסיימת בלי לשמור', () => {
    const t = creditPhoneTurn({ [CR_OK]: '2' }, ctx)
    expect(t.action).toBeNull()
    expect(t.reply).toContain('hangup')
  })
  it('מבקש את השדות לפי הסדר', () => {
    expect(creditPhoneTurn({ [CR_OK]: '1' }, ctx).reply).toContain(CR_HOLDER)
    expect(creditPhoneTurn({ [CR_OK]: '1', [CR_HOLDER]: 'x.wav' }, ctx).reply).toContain(CR_BANK)
    expect(creditPhoneTurn({ [CR_OK]: '1', [CR_HOLDER]: 'x', [CR_BANK]: '12' }, ctx).reply).toContain(CR_BRANCH)
    expect(creditPhoneTurn({ [CR_OK]: '1', [CR_HOLDER]: 'x', [CR_BANK]: '12', [CR_BRANCH]: '345' }, ctx).reply).toContain(CR_ACCT)
  })
  const all = { [CR_OK]: '1', [CR_HOLDER]: 'x.wav', [CR_BANK]: '12', [CR_BRANCH]: '345', [CR_ACCT]: '123456' }
  it('מקריא את מה שהוקש ומבקש אישור לפני שמירה', () => {
    const t = creditPhoneTurn(all, ctx)
    expect(t.action).toBeNull()
    expect(t.reply).toContain('d-123456')
    expect(t.reply).toContain(CR_CONFIRM)
  })
  it('שומר רק באישור, ולא בביטול', () => {
    expect(creditPhoneTurn({ ...all, [CR_CONFIRM]: '1' }, ctx).action).toEqual({
      kind: 'save', holderRecording: 'x.wav', bank: '12', branch: '345', account: '123456',
    })
    expect(creditPhoneTurn({ ...all, [CR_CONFIRM]: '2' }, ctx).action).toBeNull()
  })
  it('פרטים לא תקינים לא נשמרים', () => {
    const t = creditPhoneTurn({ ...all, [CR_ACCT]: '12', [CR_CONFIRM]: '1' }, ctx)
    expect(t.action).toBeNull()
  })
  it('מי שכבר מילא לא נשאל שוב', () => {
    const t = creditPhoneTurn({}, { ...ctx, alreadyDone: true })
    expect(t.action).toBeNull()
    expect(t.reply).not.toContain('read=')
  })
})

describe('מייל וסכום', () => {
  it('מנקה HTML משם וספרים', () => {
    const h = buildCreditEmailHtml({ name: '<b>x</b>', books: '<script>', amountAgorot: 1000, url: 'https://x/credit/abc' })
    expect(h).not.toContain('<script>')
    expect(h).not.toContain('<b>x</b>')
    expect(h).toContain('10 ש"ח')
  })
  it('הקראת סכום', () => {
    expect(amountSpoken(100)).toBe('שקל אחד')
    expect(amountSpoken(1250)).toBe('12 שקלים ו-50 אגורות')
  })
})
