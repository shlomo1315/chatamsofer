import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/apiAuth', () => ({ getServiceClient: vi.fn() }))
import { getServiceClient } from '@/lib/apiAuth'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/donor-report/route'
import { POST as AUTH } from '@/app/api/donor-report/auth/route'
import {
  hashDonorPassword, checkDonorPassword, issueDonorSession, verifyDonorSession, validateDonorPassword, DONOR_COOKIE,
} from './donorReportAuth'

const TOKEN = 'a'.repeat(43)

function fakeDb(link: Record<string, unknown> | null, spy?: (t: string) => void) {
  return {
    from: (t: string) => {
      spy?.(t)
      const q: Record<string, unknown> = {}
      q.select = () => q; q.eq = () => q; q.not = () => q; q.range = () => Promise.resolve({ data: [], error: null })
      q.maybeSingle = () => Promise.resolve({ data: link })
      q.update = () => ({ eq: () => Promise.resolve({}) })
      return q
    },
  }
}

beforeEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret' })

describe('סיסמת קישור הנדיב', () => {
  it('מאמת סיסמה נכונה ודוחה שגויה או ריקה', async () => {
    const h = await hashDonorPassword('secret1')
    expect(await checkDonorPassword('secret1', h)).toBe(true)
    expect(await checkDonorPassword('wrong', h)).toBe(false)
    expect(await checkDonorPassword('', h)).toBe(false)
    expect(await checkDonorPassword('secret1', null)).toBe(false)
  })
  it('דורש סיסמה באורך סביר', () => {
    expect(validateDonorPassword('123')).not.toBeNull()
    expect(validateDonorPassword(undefined)).not.toBeNull()
    expect(validateDonorPassword('123456')).toBeNull()
  })
  it('session: תקף רק לקישור ולסיסמה שלו, ופג', () => {
    const c = issueDonorSession('L1', 'hashA', 1000)
    expect(verifyDonorSession(c, 'L1', 'hashA', 2000)).toBe(true)
    expect(verifyDonorSession(c, 'L2', 'hashA', 2000)).toBe(false)
    expect(verifyDonorSession(c, 'L1', 'hashB', 2000)).toBe(false)
    expect(verifyDonorSession(c, 'L1', 'hashA', 1000 + 13 * 3600_000)).toBe(false)
    expect(verifyDonorSession(undefined, 'L1', 'hashA')).toBe(false)
    expect(verifyDonorSession(c, 'L1', null)).toBe(false)
  })
})

describe('/api/donor-report: אין נתונים בלי סיסמה', () => {
  const req = (cookie?: string) => new NextRequest(`http://x/api/donor-report?t=${TOKEN}`, { headers: cookie ? { cookie: `${DONOR_COOKIE}=${cookie}` } : {} })

  it('קישור בלי סיסמה מוגדרת: 403 ואין שליפת יולדות', async () => {
    const tables: string[] = []
    vi.mocked(getServiceClient).mockReturnValue(fakeDb({ id: 'L1', token: TOKEN, label: 'x', recovery_home: null, revoked_at: null, password_hash: null }, t => tables.push(t)) as never)
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(tables).not.toContain('maternity_aids')
  })
  it('קישור עם סיסמה אך בלי cookie: 401 ואין שליפת יולדות', async () => {
    const tables: string[] = []
    vi.mocked(getServiceClient).mockReturnValue(fakeDb({ id: 'L1', token: TOKEN, label: 'x', recovery_home: null, revoked_at: null, password_hash: 'h' }, t => tables.push(t)) as never)
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect((await res.json()).needsPassword).toBe(true)
    expect(tables).not.toContain('maternity_aids')
  })
  it('cookie מזויף או של קישור אחר: 401', async () => {
    vi.mocked(getServiceClient).mockReturnValue(fakeDb({ id: 'L1', token: TOKEN, label: 'x', recovery_home: null, revoked_at: null, password_hash: 'h' }) as never)
    expect((await GET(req('L1.9999999999999.forged'))).status).toBe(401)
    expect((await GET(req(issueDonorSession('L2', 'h')))).status).toBe(401)
  })
  it('cookie תקף: 200', async () => {
    vi.mocked(getServiceClient).mockReturnValue(fakeDb({ id: 'L1', token: TOKEN, label: 'x', recovery_home: null, revoked_at: null, password_hash: 'h' }) as never)
    expect((await GET(req(issueDonorSession('L1', 'h')))).status).toBe(200)
  })
})

describe('/api/donor-report/auth', () => {
  const post = (password: string) => new NextRequest('http://x/api/donor-report/auth', {
    method: 'POST', body: JSON.stringify({ t: TOKEN, password }), headers: { 'x-forwarded-for': `9.9.9.${Math.floor(Math.random() * 250)}` },
  })
  it('סיסמה נכונה קובעת cookie, שגויה נדחית, וקישור בלי סיסמה נחסם', async () => {
    const hash = await hashDonorPassword('secret1')
    vi.mocked(getServiceClient).mockReturnValue(fakeDb({ id: 'L9', token: TOKEN, label: 'x', recovery_home: null, revoked_at: null, password_hash: hash }) as never)
    expect((await AUTH(post('nope'))).status).toBe(401)
    const ok = await AUTH(post('secret1'))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('set-cookie')).toContain(`${DONOR_COOKIE}=`)
    vi.mocked(getServiceClient).mockReturnValue(fakeDb({ id: 'L9', token: TOKEN, label: 'x', recovery_home: null, revoked_at: null, password_hash: null }) as never)
    expect((await AUTH(post('secret1'))).status).toBe(403)
  })
})
