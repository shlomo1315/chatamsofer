import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { mailFor, normalizeDepartmentKey, AID_DEPT_EMAIL, AID_ALIAS_EMAILS } from './departments'
import { aidAffiliation } from '@/components/admin/AidTypeLabels'

const perm = vi.fn()
const send = vi.fn()
vi.mock('@/lib/apiAuth', () => ({
  requirePermission: (...a: unknown[]) => perm(...a),
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }), maybeSingle: async () => ({ data: null }) }) }),
      update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({}) }) }) }) }),
    }),
  }),
}))
vi.mock('@/lib/aidInquiry', async () => {
  const actual = await vi.importActual<typeof import('./aidInquiry')>('./aidInquiry')
  return { ...actual, sendAidInquiry: (...a: unknown[]) => send(...a) }
})

import { GET, POST } from '@/app/api/admin/aid/[source]/[id]/messages/route'

const params = (source: string, id = 'r1') => ({ params: Promise.resolve({ source, id }) })
const post = (source: string, body: unknown) => POST(
  new NextRequest('http://x/api', { method: 'POST', body: JSON.stringify(body) }), params(source))

describe('מחלקת סיוע — כתובות', () => {
  it('מפתחות ישנים מתנרמלים למחלקת סיוע', () => {
    expect(normalizeDepartmentKey('widows')).toBe('aid')
    expect(normalizeDepartmentKey('medical')).toBe('aid')
    expect(normalizeDepartmentKey('loans')).toBe('loans')
  })
  it('c@ למחלקה, ו-a@ ו-r@ נשארות כינויים', () => {
    expect(AID_DEPT_EMAIL).toBe('c@chasamsofer.info')
    expect(AID_ALIAS_EMAILS).toEqual(['a@chasamsofer.info', 'r@chasamsofer.info'])
    expect(mailFor('medical').fromEmail).toBe(AID_DEPT_EMAIL)
    expect(mailFor('widows').department).toBe('aid')
  })
})

describe('שיוך מבקש', () => {
  it('רשום / צאצא לא רשום / חיצוני', () => {
    expect(aidAffiliation({ beneficiary_id: 'b1' })).toBe('registered')
    expect(aidAffiliation({ beneficiary_id: null, is_descendant: true })).toBe('unregistered_descendant')
    expect(aidAffiliation({ beneficiary_id: null, is_descendant: false })).toBe('external')
  })
})

describe('API התכתבות בכרטסת סיוע', () => {
  beforeEach(() => { perm.mockReset(); send.mockReset(); perm.mockResolvedValue({ userId: 'u1' }) })

  it('מקור לא תקין נדחה', async () => {
    expect((await post('evil', { message: 'שלום' })).status).toBe(400)
    expect((await GET(new NextRequest('http://x/api'), params('evil'))).status).toBe(400)
  })
  it('בלי הרשאה לא שולח', async () => {
    perm.mockResolvedValue(null)
    expect((await post('financial_aid_requests', { message: 'שלום' })).status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })
  it('הודעה ריקה נדחית', async () => {
    expect((await post('financial_aid_requests', { message: '  ' })).status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })
  it('שולח לכרטסת לפי המקור, עם הרשאת widows לאלמנה', async () => {
    send.mockResolvedValue({ ok: true })
    const res = await post('widow_requests', { message: 'שלום' })
    expect(res.status).toBe(200)
    expect(perm).toHaveBeenCalledWith('widows', 'edit')
    expect(send.mock.calls[0][1]).toBe('widow_requests')
    expect(send.mock.calls[0][3]).toBe('שלום')
  })
  it('כשל בשליחה מוחזר כשגיאה', async () => {
    send.mockResolvedValue({ ok: false, error: 'אין מייל' })
    const res = await post('financial_aid_requests', { message: 'שלום' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('אין מייל')
  })
  it('קריאה מחזירה רשימה', async () => {
    const res = await GET(new NextRequest('http://x/api'), params('financial_aid_requests'))
    expect(res.status).toBe(200)
    expect((await res.json()).messages).toEqual([])
  })
})
