import { describe, it, expect } from 'vitest'
import {
  parseCreditsTable, validateBank, creditPhoneTurn, buildCreditEmailHtml, amountSpoken, pickPhoneCredit, mergePhoneCredits, canSaveBank, validateIsraeliId, creditStatusLabel,
  parseTestSend, TEST_CREDIT, normalizeCreditPhone, isTestSendLimited,
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

describe('mergePhoneCredits', () => {
  const r = (id: number, status: string, books: string, amount_agorot: number) => ({ id, status, books, amount_agorot, customer_name: 'דני' })
  it('מאחד כמה זיכויים פתוחים לשיחה אחת', () => {
    const m = mergePhoneCredits([r(1, 'sent', 'ספר א', 1000), r(2, 'pending', 'ספר ב', 500), r(3, 'answered', 'ספר ג', 250)])
    expect(m?.rows.map(x => x.id)).toEqual([1, 3])
    expect(m?.ctx).toEqual({ name: 'דני', books: 'ספר א. ספר ג', amountAgorot: 1250 })
  })
  it('לא מזוהה: null', () => {
    expect(mergePhoneCredits([r(1, 'pending', 'ספר', 100)])).toBeNull()
    expect(mergePhoneCredits([])).toBeNull()
  })
  it('כבר מילא: משמיע סיכום בלי איסוף', () => {
    const m = mergePhoneCredits([r(1, 'details_entered', 'ספר א', 1000)])!
    const t = creditPhoneTurn({}, { ...m.ctx, alreadyDone: true })
    expect(t.reply).toContain('ספר')
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

describe('pickPhoneCredit', () => {
  it('לא פותח זיכוי שעוד לא נשלח או שהשליחה נכשלה', () => {
    expect(pickPhoneCredit([{ status: 'pending' }, { status: 'send_failed' }])).toBeNull()
  })
  it('פותח זיכוי שנשלח או שנענה', () => {
    expect(pickPhoneCredit([{ id: 1, status: 'pending' }, { id: 2, status: 'sent' }])).toEqual({ credit: { id: 2, status: 'sent' }, open: true })
    expect(pickPhoneCredit([{ status: 'answered' }])?.open).toBe(true)
  })
  it('זיכוי שכבר הוזנו פרטיו מוצג כסגור', () => {
    expect(pickPhoneCredit([{ status: 'details_entered' }, { status: 'pending' }])).toEqual({ credit: { status: 'details_entered' }, open: false })
  })
})

describe('parseTestSend', () => {
  it('מקבל מייל וטלפון ומנרמל אותם', () => {
    expect(parseTestSend({ email: ' A@B.co ', phone: '050-123-4567' })).toEqual({ email: 'a@b.co', phone: '0501234567' })
    expect(parseTestSend({ phone: '+972501234567' })).toEqual({ email: null, phone: '0501234567' })
    expect(parseTestSend({ email: 'a@b.co' })).toEqual({ email: 'a@b.co', phone: null })
  })
  it('דוחה קלט ריק או לא תקין', () => {
    expect(parseTestSend(null)).toHaveProperty('error')
    expect(parseTestSend({ email: '', phone: '' })).toHaveProperty('error')
    expect(parseTestSend({ email: 'bad' })).toHaveProperty('error')
    expect(parseTestSend({ email: 'a@b.co', phone: '123' })).toHaveProperty('error')
  })
  it('נתוני הדוגמה מריצים את פתיחת השיחה', () => {
    expect(creditPhoneTurn({}, TEST_CREDIT).reply).toContain('read=')
  })
})

describe('normalizeCreditPhone', () => {
  it('מחזיר 0 מוביל לכל הצורות', () => {
    for (const v of [501234567, '501234567', '0501234567', '050-123-4567', '050 123 4567', '972501234567', '+972-50-123-4567', '00972501234567', '501234567.0', 501234567.0]) {
      expect(normalizeCreditPhone(v)).toBe('0501234567')
    }
    expect(normalizeCreditPhone(21234567)).toBe('021234567')
  })
  it('דוחה מספר לא תקין', () => {
    for (const v of ['', '123', '05012345', 'abc', '12345678901']) expect(normalizeCreditPhone(v)).toBeNull()
  })
  it('פרסור אקסל קולט טלפון שאיבד 0', () => {
    const r = parseCreditsTable([head, ['דוד', 501234567, '', 'ספר', 10], ['משה', '521234567', '', 'ספר', 10]])
    expect(r.errors).toEqual([])
    expect(r.credits.map(c => c.phone)).toEqual(['0501234567', '0521234567'])
  })
})

describe('canSaveBank', () => {
  it('שומר פרטי בנק רק בזיכוי שנשלח או שהלקוח ענה עליו', () => {
    expect(canSaveBank('sent')).toBe(true)
    expect(canSaveBank('answered')).toBe(true)
    for (const s of ['pending', 'send_failed', 'details_entered', '']) expect(canSaveBank(s)).toBe(false)
  })
})

describe('isTestSendLimited', () => {
  it('חוסם מהשליחה השישית', () => {
    expect(isTestSendLimited(0)).toBe(false)
    expect(isTestSendLimited(4)).toBe(false)
    expect(isTestSendLimited(5)).toBe(true)
    expect(isTestSendLimited(9)).toBe(true)
  })
})

describe('validateIsraeliId', () => {
  it('מקבל ת"ז תקינה ומשלים אפסים מובילים', () => {
    expect(validateIsraeliId('123456782')).toBe('123456782')
    expect(validateIsraeliId('12345678-2')).toBe('123456782')
    expect(validateIsraeliId('39337423')).toBe('039337423')
  })
  it('דוחה ספרת ביקורת שגויה, קצר או ארוך מדי', () => {
    expect(validateIsraeliId('123456789')).toBeNull()
    expect(validateIsraeliId('1234')).toBeNull()
    expect(validateIsraeliId('1234567890')).toBeNull()
    expect(validateIsraeliId('000000000')).toBeNull()
    expect(validateIsraeliId('')).toBeNull()
  })
})

describe('creditStatusLabel', () => {
  it('הועבר בבנק גובר על הסטטוס', () => {
    expect(creditStatusLabel('details_entered', '2026-10-19T10:00:00Z')).toBe('הועבר בבנק')
    expect(creditStatusLabel('details_entered', null)).toBe('הזין פרטים')
  })
})

describe('מייל: מספר זהות', () => {
  it('המייל מבקש גם מספר זהות', () => {
    expect(buildCreditEmailHtml({ name: null, books: 'x', amountAgorot: 100, url: 'https://x' })).toContain('מספר הזהות')
  })
})
