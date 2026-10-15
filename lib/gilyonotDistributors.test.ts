import { describe, expect, it } from 'vitest'
import {
  cleanIdNumber, cleanPhone, detectHeader, isAgentAvailable, normalizeAgentHours, normalizeLoginId,
  parseCsv, parseDistributorTable, planDistributorAction, summarizeByCity, validateDistributor,
} from './gilyonotDistributors'

describe('נרמול שדות', () => {
  it('טלפון ישראלי', () => {
    expect(cleanPhone('052-123-4567')).toBe('0521234567')
    expect(cleanPhone('+972 52 1234567')).toBe('0521234567')
    expect(cleanPhone('521234567')).toBe('0521234567')
    expect(cleanPhone('02-6512345')).toBe('026512345')
    expect(cleanPhone('123')).toBeNull()
  })
  it('ת.ז. עם ספרת ביקורת, מרופדת ל-9', () => {
    expect(cleanIdNumber('000000018')).toBe('000000018')
    expect(cleanIdNumber('18')).toBe('000000018')
    expect(cleanIdNumber('123456789')).toBeNull()
    expect(cleanIdNumber('0')).toBeNull()
  })
  it('מזהה כניסה לפי השיטה', () => {
    expect(normalizeLoginId('phone', '052 123 4567')).toBe('0521234567')
    expect(normalizeLoginId('email', ' A@B.co ')).toBe('a@b.co')
    expect(normalizeLoginId('id_number', '18')).toBe('000000018')
  })
})

describe('validateDistributor', () => {
  it('שדה שהוזן ואינו תקין נדחה, ולא נשמר כריק', () => {
    expect(validateDistributor({ full_name: 'משה', phone: '12' })).toEqual({ ok: false, error: 'מספר טלפון לא תקין' })
    expect(validateDistributor({ full_name: '', phone: '0521234567' })).toMatchObject({ ok: false })
    expect(validateDistributor({ full_name: 'משה', quantity: '2.5' })).toMatchObject({ ok: false })
  })
  it('כמות ריקה = 0, ופסיקים באלפים מותרים', () => {
    const a = validateDistributor({ full_name: 'משה' })
    expect(a.ok && a.value.quantity).toBe(0)
    const b = validateDistributor({ full_name: 'משה', quantity: '1,200', city: ' "בני ברק" ' })
    expect(b.ok && b.value).toMatchObject({ quantity: 1200, city: 'בני ברק' })
  })
})

describe('ייבוא', () => {
  it('מזהה כותרות בכל סדר ובניסוחים שונים', () => {
    expect(detectHeader('שם המפיץ')).toBe('full_name')
    expect(detectHeader('מספר טלפון נייד')).toBe('phone')
    expect(detectHeader('טלפון 2')).toBe('phone2')
    expect(detectHeader('ת.ז.')).toBe('id_number')
    expect(detectHeader('בית הכנסת')).toBe('synagogue')
    expect(detectHeader('ביהכ"נ')).toBe('synagogue')
    expect(detectHeader('כמות גיליונות שבועית')).toBe('quantity')
    expect(detectHeader('כתובת מייל')).toBe('email')
    expect(detectHeader('משהו אחר')).toBeNull()
  })
  it('CSV עם מרכאות, פסיקים בתוך תא ושורות ריקות', () => {
    expect(parseCsv('שם,כתובת\n"כהן, משה","רח\' ""הרב"" 5"\n\n')).toEqual([['שם', 'כתובת'], ['כהן, משה', 'רח\' "הרב" 5']])
    expect(parseCsv('a;b\r\n1;2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('טבלה → מפיצים, ושורות פסולות עם מספר השורה', () => {
    const r = parseDistributorTable([
      ['עיר', 'שם', 'טלפון', 'כמות'],
      ['ירושלים', 'משה כהן', '0521234567', '40'],
      ['בני ברק', '', '0527654321', '10'],
      ['בני ברק', 'יוסי', '12', '10'],
    ])
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ full_name: 'משה כהן', city: 'ירושלים', phone: '0521234567', quantity: 40 })
    expect(r.invalid).toEqual([{ line: 3, error: 'חסר שם' }, { line: 4, error: 'מספר טלפון לא תקין' }])
  })
  it('בלי עמודת שם — שגיאה ברורה', () => {
    expect(parseDistributorTable([['טלפון'], ['0521234567']]).error).toMatch(/שם/)
  })
})

describe('summarizeByCity', () => {
  it('סופר רק פעילים, ממיין לפי כמות', () => {
    const s = summarizeByCity([
      { city: 'ירושלים', quantity: 10, status: 'active' },
      { city: 'בני ברק', quantity: 50, status: 'active' },
      { city: 'ירושלים', quantity: 30, status: 'active' },
      { city: 'ירושלים', quantity: 99, status: 'removed' },
      { city: null, quantity: 5, status: 'active' },
    ])
    expect(s).toEqual([
      { city: 'בני ברק', distributors: 1, quantity: 50 },
      { city: 'ירושלים', distributors: 2, quantity: 40 },
      { city: 'ללא עיר', distributors: 1, quantity: 5 },
    ])
  })
})

describe('שעות נציג', () => {
  it('בודק לפי שעון ישראל', () => {
    const hours = normalizeAgentHours([{ day: 1, from: '09:00', to: '13:00' }])!
    // יום שני 2026-10-19, 10:00 בישראל = 07:00 UTC (שעון חורף מתחיל ב-25.10)
    expect(isAgentAvailable(hours, new Date('2026-10-19T07:00:00Z'))).toBe(true)
    expect(isAgentAvailable(hours, new Date('2026-10-19T10:30:00Z'))).toBe(false)
    expect(isAgentAvailable(hours, new Date('2026-10-18T07:00:00Z'))).toBe(false)
  })
  it('דוחה חלון לא תקין', () => {
    expect(normalizeAgentHours([{ day: 7, from: '09:00', to: '10:00' }])).toBeNull()
    expect(normalizeAgentHours([{ day: 1, from: '12:00', to: '10:00' }])).toBeNull()
  })
})

describe('planDistributorAction', () => {
  const d = { id: 'x', quantity: 40, city: 'ירושלים', address: 'רח\' א 1', status: 'active' as const }
  it('דוחה פעולה לא מוכרת ומפיץ שהוסר', () => {
    expect(planDistributorAction(d, 'admin_edit', {})).toMatchObject({ ok: false })
    expect(planDistributorAction({ ...d, status: 'removed' }, 'note', { details: 'x' })).toMatchObject({ ok: false })
  })
  it('קבלה: תואם = טופל, הפרש = פתוח', () => {
    const a = planDistributorAction(d, 'received', { quantity: '40' })
    const b = planDistributorAction(d, 'received', { quantity: '35' })
    expect(a.ok && a.plan.event.status).toBe('done')
    expect(b.ok && b.plan.event.status).toBe('open')
    expect(planDistributorAction(d, 'received', {})).toMatchObject({ ok: false })
  })
  it('תוספת והפחתה לא משנות כמות עד אישור, ובכיוון הנכון בלבד', () => {
    const a = planDistributorAction(d, 'increase', { quantity: 60 })
    expect(a.ok && a.plan).toMatchObject({ update: null, event: { quantity: 60, status: 'open' } })
    expect(planDistributorAction(d, 'increase', { quantity: 30 })).toMatchObject({ ok: false })
    expect(planDistributorAction(d, 'decrease', { quantity: 50 })).toMatchObject({ ok: false })
  })
  it('כתובת והתנתקות מתעדכנות מיד ומודיעות לשליח', () => {
    const a = planDistributorAction(d, 'address', { address: 'רח\' ב 2' })
    expect(a.ok && a.plan).toMatchObject({ update: { address: 'רח\' ב 2', city: 'ירושלים' }, notifyCourier: true })
    const b = planDistributorAction(d, 'leave', {})
    expect(b.ok && b.plan).toMatchObject({ update: { status: 'removed' }, notifyCourier: true })
  })
})
