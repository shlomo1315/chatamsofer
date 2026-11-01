import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/kvitelAi', () => ({ askClaudeJson: vi.fn(async () => ({ summary: 'לתקן שנה בפרשת וארא' })) }))
const insert = vi.fn(async () => ({ error: null }))
const update = vi.fn()
vi.mock('@/lib/apiAuth', () => ({
  getServiceClient: () => ({
    from: () => ({
      insert,
      update: (v: unknown) => { update(v); return { eq: () => ({ eq: () => ({ select: async () => ({ data: [{ id: 'x' }], error: null }) }) }) } },
    }),
  }),
  requireAdmin: vi.fn(async () => ({ userId: 'u1' })),
  forbidden: () => new Response('{}', { status: 403 }),
}))

import { POST as submit } from '@/app/api/archive-requests/route'
import { POST as decide } from '@/app/api/admin/archive-requests/route'
import { parseRequest } from '@/lib/archiveRequests'
import { __resetRateLimits } from '@/lib/rateLimit'

const req = (body: unknown, ip = '1.1.1.1') =>
  new Request('http://x/api', { method: 'POST', headers: { 'x-real-ip': ip }, body: JSON.stringify(body) })

beforeEach(() => { __resetRateLimits(); insert.mockClear(); update.mockClear() })

describe('בקשות תיקון בארכיון', () => {
  it('שולח בקשה, מנקה תגיות ושומר עם סיכום', async () => {
    const res = await submit(req({ body: 'השנה <b>לא</b> נכונה בוארא', area: 'וארא' }))
    expect(res.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ body: 'השנה לא נכונה בוארא', summary: 'לתקן שנה בפרשת וארא' }))
  })
  it('דוחה טקסט ריק ושדה מלכודת לא נשמר', async () => {
    expect((await submit(req({ body: '' }))).status).toBe(400)
    expect((await submit(req({ body: 'טקסט תקין', website: 'spam' }))).status).toBe(200)
    expect(insert).not.toHaveBeenCalled()
  })
  it('מגביל קצב לפי כתובת', async () => {
    for (let i = 0; i < 5; i++) await submit(req({ body: 'בקשה מספר ' + i }))
    expect((await submit(req({ body: 'בקשה שישית' }))).status).toBe(429)
  })
  it('מנהל מאשר בקשה', async () => {
    const res = await decide(req({ id: '123e4567-e89b-42d3-a456-426614174000', action: 'approve' }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', decided_by: 'u1' }))
  })
  it('אישור עם מזהה לא תקין נדחה', async () => {
    expect((await decide(req({ id: 'abc', action: 'approve' }))).status).toBe(400)
  })
  it('parseRequest חותך אורך', () => {
    expect(parseRequest({ body: 'א'.repeat(5000) })!.body.length).toBe(2000)
  })
})
