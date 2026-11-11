import { describe, it, expect, vi, beforeEach } from 'vitest'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
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
    upload.mockClear()
  })

  it('כשהשמירה נכשלת מוחקים את הקבצים שהועלו', async () => {
    const form = new FormData()
    form.set('id_number', '123456782')
    form.set('phone', '0501234567')
    form.set('amount', '1000')
    form.set('reason', 'צריך סיוע לטיפול רפואי')
    form.append('medical', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3])], 'a.pdf'))
    form.set('privacy_consent', '1')
    form.append('signature', new File([PNG], 'signature.png'))
    const req = { nextUrl: new URL('http://x/api/medical/submit'), headers: new Headers({ 'x-forwarded-for': '9.9.9.9' }), cookies: { get: () => undefined }, formData: async () => form } as never
    const res = await POST(req)
    expect(res.status).toBe(500)
    expect(upload).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledTimes(1)
    const paths = (remove.mock.calls[0] as unknown as [string[]])[0]
    expect(paths).toHaveLength(2)
  })

  const post = (form: FormData, ip: string) => POST({ nextUrl: new URL('http://x/api/medical/submit'), headers: new Headers({ 'x-forwarded-for': ip }), cookies: { get: () => undefined }, formData: async () => form } as never)
  const base = () => {
    const f = new FormData()
    f.set('id_number', '123456782')
    f.set('phone', '0501234567')
    return f
  }

  it('בלי אישור פרטיות הבקשה נחסמת', async () => {
    const f = base()
    f.append('signature', new File([PNG], 'signature.png'))
    const res = await post(f, '8.8.8.1')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/פרטיות/)
  })

  it('בלי חתימה, או עם חתימה שאינה תמונה, הבקשה נחסמת', async () => {
    const f = base()
    f.set('privacy_consent', '1')
    expect((await post(f, '8.8.8.2')).status).toBe(400)
    f.append('signature', new File(['hello'], 'signature.png'))
    const res = await post(f, '8.8.8.3')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/לחתום/)
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('קישור /medical/new', () => {
  it('עמוד הקישור קיים ומציג את הטופס בלי כניסה', async () => {
    const mod = await import('@/app/medical/new/page')
    expect(typeof mod.default).toBe('function')
    expect(mod.metadata.title).toMatch(/בקשת סיוע/)
  })
})
