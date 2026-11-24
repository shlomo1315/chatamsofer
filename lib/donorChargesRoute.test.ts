import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/apiAuth', () => ({ getServiceClient: vi.fn() }))
import { getServiceClient } from '@/lib/apiAuth'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/donor-report/charges/route'
import { hashDonorPassword, issueDonorSession, DONOR_COOKIE } from './donorReportAuth'

const TOKEN = 'b'.repeat(43)
const aid = (home: string) => ({ status: 'active', recovery_home: home, beneficiary: { full_name: 'שרה', family_name: 'כהן', id_number: '012345678' } })
const RECEIPTS = [
  { id: 'a', home: 'בית א', amount: 500, nights: 2, note: null, is_initial: true, created_at: '2026-11-10T08:00:00Z', aid: aid('בית א') },
  { id: 'b', home: 'בית ב', amount: 700, nights: 3, note: null, is_initial: true, created_at: '2026-11-10T09:00:00Z', aid: aid('בית ב') },
]

function fakeDb(link: Record<string, unknown>, tables: string[] = []) {
  return {
    from: (t: string) => {
      tables.push(t)
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'not', 'gte', 'lt', 'order']) q[m] = () => q
      q.range = () => Promise.resolve({ data: t === 'recovery_receipts' ? RECEIPTS : [], error: null })
      q.maybeSingle = () => Promise.resolve({ data: link })
      q.update = () => ({ eq: () => Promise.resolve({}) })
      return q
    },
  }
}

let hash = ''
beforeEach(async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret'
  hash ||= await hashDonorPassword('secret1')
})

const link = (home: string | null) => ({ id: 'L1', token: TOKEN, label: 'x', recovery_home: home, revoked_at: null, password_hash: hash })
const req = (qs: string, withCookie = true) => new NextRequest(`http://x/api/donor-report/charges?t=${TOKEN}&${qs}`, {
  headers: withCookie ? { cookie: `${DONOR_COOKIE}=${issueDonorSession('L1', hash)}` } : {},
})

describe('/api/donor-report/charges', () => {
  it('בלי cookie: 401 ואין שליפת חיובים', async () => {
    const tables: string[] = []
    vi.mocked(getServiceClient).mockReturnValue(fakeDb(link(null), tables) as never)
    const res = await GET(req('dates=2026-11-10', false))
    expect(res.status).toBe(401)
    expect(tables).not.toContain('recovery_receipts')
  })

  it('בחירה לא תקינה: 400', async () => {
    vi.mocked(getServiceClient).mockReturnValue(fakeDb(link(null)) as never)
    expect((await GET(req('from=2026-11-10&to=2026-11-01'))).status).toBe(400)
  })

  it('קישור נעול רואה רק את הסניף שלו, ובלי ת״ז מלאה', async () => {
    vi.mocked(getServiceClient).mockReturnValue(fakeDb(link('בית ב')) as never)
    const res = await GET(req('dates=2026-11-10'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.branches.map((b: { home: string }) => b.home)).toEqual(['בית ב'])
    expect(body.amount).toBe(700)
    expect(JSON.stringify(body)).not.toContain('012345678')
  })

  it('format=xlsx מחזיר קובץ אקסל', async () => {
    vi.mocked(getServiceClient).mockReturnValue(fakeDb(link(null)) as never)
    const res = await GET(req('from=2026-11-10&to=2026-11-10&format=xlsx'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('spreadsheetml')
    const buf = new Uint8Array(await res.arrayBuffer())
    expect([buf[0], buf[1]]).toEqual([0x50, 0x4b]) // ZIP
  })
})
