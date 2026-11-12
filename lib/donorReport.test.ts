import { describe, it, expect } from 'vitest'
import {
  cleanDate, effectiveFilter, filterRows, summarize, generateDonorToken,
  isWellFormedDonorToken, resolveDonorLink, checkDonorPassword, hashDonorPassword, validatePasswordInput, type DonorRow,
} from './donorReport'

const r = (o: Partial<DonorRow>): DonorRow => ({ id: 'x', name: 'כהן שרה', home: 'טלזסטון', date: '2026-05-10', amount: 1000, ...o })

describe('טוקן', () => {
  it('נוצר באורך ובתווים תקינים וייחודי', () => {
    const a = generateDonorToken(), b = generateDonorToken()
    expect(isWellFormedDonorToken(a)).toBe(true)
    expect(a).not.toBe(b)
  })
  it('דוחה טוקן קצר, ריק או עם תווים זרים', () => {
    for (const t of ['', 'abc', 'a'.repeat(42), 'a'.repeat(44), '!'.repeat(43), undefined, 5]) {
      expect(isWellFormedDonorToken(t)).toBe(false)
    }
  })
})

describe('resolveDonorLink', () => {
  const fakeDb = (row: unknown) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
  }) as never

  it('טוקן לא תקין לא מגיע למסד', async () => {
    const db = { from: () => { throw new Error('לא אמור לגשת') } } as never
    expect(await resolveDonorLink(db, 'bad')).toBeNull()
  })
  it('טוקן שלא קיים → null', async () => {
    expect(await resolveDonorLink(fakeDb(null), generateDonorToken())).toBeNull()
  })
  it('🔴 קישור שבוטל → null', async () => {
    const row = { id: '1', token: 't', label: 'x', recovery_home: null, revoked_at: '2026-01-01T00:00:00Z' }
    expect(await resolveDonorLink(fakeDb(row), generateDonorToken())).toBeNull()
  })
  it('קישור פעיל → מוחזר', async () => {
    const row = { id: '1', token: 't', label: 'x', recovery_home: null, revoked_at: null }
    expect((await resolveDonorLink(fakeDb(row), generateDonorToken()))?.id).toBe('1')
  })
})

describe('effectiveFilter', () => {
  it('🔴 בית נעול גובר על הבקשה מהדפדפן', () => {
    const f = effectiveFilter({ recovery_home: 'טלזסטון' }, { home: 'בית אחר' })
    expect(f.home).toBe('טלזסטון')
  })
  it('קישור לא נעול מכבד את הבקשה', () => {
    expect(effectiveFilter({ recovery_home: null }, { home: 'ירושלים' }).home).toBe('ירושלים')
  })
  it('תאריך לא תקין נזרק', () => {
    expect(cleanDate('2026-13-45')).toBeNull()
    expect(cleanDate("2026-01-01'; drop")).toBeNull()
    expect(cleanDate('2026-02-03')).toBe('2026-02-03')
  })
})

describe('filterRows + summarize', () => {
  const rows = [
    r({ id: '1', date: '2026-05-01', amount: 1000 }),
    r({ id: '2', date: '2026-05-20', amount: 2500 }),
    r({ id: '3', date: '2026-06-01', amount: 700, home: 'אחר' }),
    r({ id: '4', date: '', amount: 300 }),
  ]
  it('סינון לפי בית וטווח תאריכים כולל קצוות', () => {
    const out = filterRows(rows, { home: 'טלזסטון', from: '2026-05-01', to: '2026-05-20' })
    expect(out.map(x => x.id)).toEqual(['1', '2'])
  })
  it('שורה בלי תאריך לא נכנסת לטווח מוגדר, אבל נכנסת בלי טווח', () => {
    expect(filterRows(rows, { from: '2026-01-01' }).map(x => x.id)).not.toContain('4')
    expect(filterRows(rows, {}).map(x => x.id)).toContain('4')
  })
  it('סיכום: מספר, סכום כולל ופילוח לפי בית', () => {
    const s = summarize(filterRows(rows, { home: 'טלזסטון' }))
    expect(s.count).toBe(3)
    expect(s.amount).toBe(3800)
    expect(s.homes).toEqual([{ home: 'טלזסטון', count: 3, amount: 3800 }])
  })
})

describe('סיסמה לקישור', () => {
  const now = new Date('2026-11-12T10:00:00Z')
  const mk = async (extra = {}) => ({ password_hash: await hashDonorPassword('secret1'), failed_attempts: 0, locked_until: null as string | null, ...extra })

  it('סיסמה נכונה מתקבלת ומאפסת מונה', async () => {
    const res = await checkDonorPassword(await mk({ failed_attempts: 3 }), 'secret1', now)
    expect(res.status).toBe('ok')
  })
  it('סיסמה שגויה נדחית ומגדילה מונה', async () => {
    const res = await checkDonorPassword(await mk({ failed_attempts: 1 }), 'nope', now)
    expect(res).toMatchObject({ status: 'wrong', patch: { failed_attempts: 2, locked_until: null } })
  })
  it('ללא סיסמה או קלט לא תקין נדחים', async () => {
    expect((await checkDonorPassword({ password_hash: null }, 'x', now)).status).toBe('no_password')
    expect((await checkDonorPassword(await mk(), undefined, now)).status).toBe('wrong')
    expect((await checkDonorPassword(await mk(), 'x'.repeat(500), now)).status).toBe('wrong')
  })
  it('נעילה אחרי 5 כשלונות, וגם סיסמה נכונה נדחית בזמן הנעילה', async () => {
    const res = await checkDonorPassword(await mk({ failed_attempts: 4 }), 'bad', now)
    expect(res.status).toBe('wrong')
    const lock = (res as { patch: { locked_until: string | null } }).patch.locked_until
    expect(lock).toBe(new Date(now.getTime() + 15 * 60_000).toISOString())
    const locked = await checkDonorPassword(await mk({ locked_until: lock }), 'secret1', now)
    expect(locked).toMatchObject({ status: 'locked', retryAfterSec: 900 })
  })
  it('אחרי שהנעילה פגה אפשר להיכנס שוב', async () => {
    const past = new Date(now.getTime() - 1000).toISOString()
    expect((await checkDonorPassword(await mk({ locked_until: past }), 'secret1', now)).status).toBe('ok')
  })
  it('אימות אורך סיסמה', () => {
    expect(validatePasswordInput('123')).not.toBeNull()
    expect(validatePasswordInput(undefined)).not.toBeNull()
    expect(validatePasswordInput('123456')).toBeNull()
  })
})
