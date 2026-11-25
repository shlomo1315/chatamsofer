import { describe, it, expect } from 'vitest'
import { draftFrom, buildCardPayload, validateCardPayload, readiness, showVerifyButton, sendVerifyLink, type CardSource } from './beneficiaryCardEdit'

const src: CardSource = {
  full_name: 'עזרא', family_name: 'זלצמן', birth_date: '1991-05-03', phone: '0533174528', phone2: undefined,
  email: 'a@b.co', spouse_name: 'רבקה', spouse_birth_date: '1993-09-14T00:00:00', spouse_phone: '0504112290',
  marital_status: 'נשואים', city: 'בני ברק', address: 'רבי עקיבא 42', notes: '',
  children: [
    { name: 'משה', id_number: '123456782', gender: 'male', birth_date: '2016-02-12' },
    { name: 'אליהו', id_number: null, gender: 'male', birth_date: '2026-11-17', birth_status: 'pending', maternity_aid_id: 'aid1' },
  ],
}

describe('buildCardPayload', () => {
  it('בלי שינוי: לא נשלח כלום', () => {
    expect(buildCardPayload(src, draftFrom(src))).toEqual({})
  })

  it('שולח רק את השדות שהשתנו, ושדה רשות שרוקן נשלח כ-null', () => {
    const d = { ...draftFrom(src), city: 'ירושלים', address: '  ' }
    expect(buildCardPayload(src, d)).toEqual({ city: 'ירושלים', address: null })
  })

  it('לעולם לא שולח ת״ז, וגם בילדים נשמרת הת״ז המקורית', () => {
    const d = draftFrom(src)
    d.children[0] = { ...d.children[0], name: 'משה חיים' }
    const p = buildCardPayload(src, { ...d, phone: '0521234567' })
    expect(p).not.toHaveProperty('id_number')
    expect(p).not.toHaveProperty('spouse_id_number')
    const kids = p.children as CardSource['children']
    expect(kids?.[0]).toMatchObject({ name: 'משה חיים', id_number: '123456782' })
    // הילד שלא נערך נשאר בדיוק כמו שהיה, כולל הקישור לתיק הלידה
    expect(kids?.[1]).toEqual(src.children![1])
  })
})

describe('validateCardPayload', () => {
  const d = draftFrom(src)
  it('חוסם שם משפחה ריק, טלפון ומייל לא תקינים', () => {
    expect(validateCardPayload({ family_name: '' }, d)).toMatch('שם משפחה')
    expect(validateCardPayload({ phone: '12' }, d)).toMatch('טלפון')
    expect(validateCardPayload({ email: 'abc' }, d)).toMatch('מייל')
  })
  it('בודק רק מה שנשלח: מייל ישן לא תקין לא חוסם שינוי עיר', () => {
    expect(validateCardPayload({ city: 'אלעד' }, { ...d, email: 'abc' })).toBeNull()
  })
  it('אצל נשואים שם האישה חובה', () => {
    expect(validateCardPayload({ spouse_name: null }, d)).toMatch('האישה')
  })
})

describe('readiness', () => {
  it('סופר את הבדיקות שעברו ומחזיר מה חסר', () => {
    const r = readiness({ id_number: '1', phone: '05', email_verified_at: null }, 9)
    expect(r.done).toBe(3)
    expect(r.missing).toEqual(['חסר אימות מייל'])
  })
})

describe('קישור לאימות מייל בחלונית', () => {
  it('הכפתור מוצג רק כשיש מייל שלא אומת, הרשאת עריכה, ולא בזמן עריכה', () => {
    const b = { email: 'a@b.co', email_verified_at: null }
    expect(showVerifyButton(b, true, false)).toBe(true)
    expect(showVerifyButton({ ...b, email_verified_at: '2026-11-01' }, true, false)).toBe(false)
    expect(showVerifyButton({ ...b, email: '' }, true, false)).toBe(false)
    expect(showVerifyButton(b, false, false)).toBe(false)
    expect(showVerifyButton(b, true, true)).toBe(false)
  })

  it('לחיצה שולחת POST לנתיב המייל של הצאצא ומחזירה נשלח', async () => {
    const calls: [string, RequestInit | undefined][] = []
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push([url, init])
      return new Response(JSON.stringify({ sent: 1 }), { status: 200 })
    }) as typeof fetch
    expect(await sendVerifyLink('abc', fetcher)).toBe('sent')
    expect(calls).toEqual([['/api/admin/beneficiaries/abc/email', { method: 'POST' }]])
  })

  it('שגיאת שרת, sent=0 או תקלת רשת מחזירים נכשל', async () => {
    const res = (body: unknown, status: number) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
    expect(await sendVerifyLink('abc', res({ error: 'x' }, 403))).toBe('failed')
    expect(await sendVerifyLink('abc', res({ sent: 0 }, 200))).toBe('failed')
    expect(await sendVerifyLink('abc', (async () => { throw new Error('net') }) as unknown as typeof fetch)).toBe('failed')
  })
})
