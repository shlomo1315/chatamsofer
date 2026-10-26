import { describe, it, expect, vi, beforeEach } from 'vitest'

const remove = vi.fn(async () => ({ error: null }))
const upload = vi.fn(async () => ({ error: null }))
const admin = {
  storage: { from: () => ({ upload, remove, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x/${p}` } }) }) },
  from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'boom' } }) }) }) }),
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => admin }))
vi.mock('@/lib/departmentGates', () => ({ isDepartmentAccessible: async () => true, departmentClosedMessage: () => '' }))
vi.mock('@/lib/portalBeneficiary', () => ({ resolveBeneficiaryByEnteredId: async () => ({ id: 'b1' }) }))

import { POST } from '@/app/api/medical/submit/route'

describe('הגשת בקשה ציבורית', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    remove.mockClear()
  })

  it('כשהשמירה נכשלת מוחקים את הקבצים שהועלו', async () => {
    const form = new FormData()
    form.set('id_number', '123456782')
    form.set('phone', '0501234567')
    form.set('amount', '1000')
    form.set('reason', 'צריך סיוע לטיפול רפואי')
    form.append('medical', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3])], 'a.pdf'))
    const req = { nextUrl: new URL('http://x/api/medical/submit'), headers: new Headers({ 'x-forwarded-for': '9.9.9.9' }), formData: async () => form } as never
    const res = await POST(req)
    expect(res.status).toBe(500)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    const paths = (remove.mock.calls[0] as unknown as [string[]])[0]
    expect(paths).toHaveLength(1)
  })
})
