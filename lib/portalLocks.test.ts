import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const calls = { updates: 0, inserts: 0 }
vi.mock('@/lib/portalSession', () => ({ getPortalBeneficiaryId: () => 'b1' }))
vi.mock('@supabase/supabase-js', () => {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    select: self, eq: self, order: self, limit: self, in: self, neq: self,
    maybeSingle: async () => ({ data: { id: 'b1', eligibility_status: 'approved', email: 'old@x.com', phone: '0521111111', full_name: 'דוד', family_name: 'כהן', children: [], verified_phones: [], required_docs: [] }, error: null }),
    single: async () => ({ data: { id: 'b1' }, error: null }),
    update: () => { calls.updates++; return chain },
    insert: () => { calls.inserts++; return chain },
    then: (r: (v: unknown) => void) => r({ data: [], error: null }),
  })
  return { createClient: () => ({ from: () => chain }) }
})

import { POST as updateDetails } from '@/app/api/portal/update-details/route'
import { POST as nameChange } from '@/app/api/portal/name-change/route'

const req = (url: string, body: unknown) => new NextRequest(`http://x/api/portal/${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://s'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
  process.env.OTP_NONCE_SECRET = 'test-secret'
  calls.updates = 0; calls.inserts = 0
})

describe('נעילת שדות בשרת', () => {
  it.each(['id_number', 'spouse_id_number', 'passport', 'full_name', 'family_name'])('update-details דוחה %s', async (f) => {
    const r = await updateDetails(req('update-details', { beneficiary_id: 'b1', [f]: 'x' }))
    expect(r.status).toBe(400)
    expect(calls.updates).toBe(0)
  })
  it.each(['id_number', 'spouse_id_number', 'passport'])('name-change דוחה %s ולא יוצר בקשה', async (f) => {
    const r = await nameChange(req('name-change', { beneficiary_id: 'b1', target: 'self', [f]: 'x' }))
    expect(r.status).toBe(400)
    expect(calls.inserts).toBe(0)
  })
  it('שינוי מייל בלי אסימון אימות נדחה ולא מעדכן', async () => {
    const r = await updateDetails(req('update-details', { beneficiary_id: 'b1', email: 'new@x.com' }))
    expect(r.status).toBe(400)
    expect(calls.updates).toBe(0)
  })
  it('שינוי מייל עם אסימון שגוי נדחה', async () => {
    const r = await updateDetails(req('update-details', { beneficiary_id: 'b1', email: 'new@x.com', email_verify_token: 'bad.token' }))
    expect(r.status).toBe(400)
    expect(calls.updates).toBe(0)
  })
  it('שינוי טלפון בלי אסימון נדחה', async () => {
    const r = await updateDetails(req('update-details', { beneficiary_id: 'b1', phone: '0529999999' }))
    expect(r.status).toBe(400)
    expect(calls.updates).toBe(0)
  })
})
