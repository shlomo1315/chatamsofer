import { describe, it, expect, vi, beforeEach } from 'vitest'
import { roleAllows } from '@/lib/permissions'
import type { SectionKey } from '@/types'

// איש הצוות המחובר — נקבע בכל בדיקה. ההכרעה עצמה היא הפונקציה האמיתית
// מ-lib/permissions, כמו ב-requirePermission.
type Staff = { role: 'admin' | 'secretary' | 'reviewer'; permissions: Record<string, string> } | null
let staff: Staff = null
const calls: { table: string; op: string }[] = []

vi.mock('@/lib/lineageEditRecheck', () => ({ recheckAfterLineageEdit: async () => ({}) }))
vi.mock('@/lib/apiAuth', () => ({
  requirePermission: async (section: SectionKey, action: 'view' | 'add' | 'edit' | 'delete') => {
    if (!staff) return null
    if (staff.role === 'admin') return staff
    return roleAllows(staff.role, staff.permissions as never, section, action) ? staff : null
  },
  forbidden: (m = 'אין הרשאה') => new Response(JSON.stringify({ error: m }), { status: 403 }),
  getServiceClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      const chain = () => q
      Object.assign(q, {
        select: chain, eq: chain, neq: chain, in: chain, limit: chain,
        maybeSingle: async () => ({ data: null }),
        update: () => { calls.push({ table, op: 'update' }); return { eq: () => ({ eq: async () => ({ error: null }), then: (r: (v: unknown) => void) => r({ error: null }) }) } },
        delete: () => { calls.push({ table, op: 'delete' }); return { in: () => ({ eq: async () => ({ error: null }) }) } },
      })
      return q
    },
  }),
}))

import { POST } from '@/app/api/admin/beneficiaries/update/route'

const req = (body: unknown) => ({ json: async () => body }) as never
const save = (extra: Record<string, unknown> = {}) => req({ action: 'save', id: 'b1', payload: { phone: '0501234567' }, ...extra })

beforeEach(() => { staff = null; calls.length = 0 })

describe('שמירת כרטסת צאצא — הרשאות', () => {
  it('מזכירה עם עריכה בצאצאים שומרת פרטים', async () => {
    staff = { role: 'secretary', permissions: { beneficiaries: 'edit' } }
    expect((await POST(save())).status).toBe(200)
    expect(calls).toContainEqual({ table: 'beneficiaries', op: 'update' })
  })
  it('מנהל שומר', async () => {
    staff = { role: 'admin', permissions: {} }
    expect((await POST(save())).status).toBe(200)
  })
  it('מזכירה עם צפייה בלבד נחסמת ולא נשמר דבר', async () => {
    staff = { role: 'secretary', permissions: { beneficiaries: 'view' } }
    expect((await POST(save())).status).toBe(403)
    expect(calls).toHaveLength(0)
  })
  it('מזכירה בלי סימון ומשתמש לא מחובר נחסמים', async () => {
    staff = { role: 'secretary', permissions: {} }
    expect((await POST(save())).status).toBe(403)
    staff = null
    expect((await POST(save())).status).toBe(403)
    expect(calls).toHaveLength(0)
  })
  it('מחיקת תיק לידה דורשת גם עריכה ביולדות', async () => {
    staff = { role: 'secretary', permissions: { beneficiaries: 'edit' } }
    expect((await POST(save({ maternityToDelete: ['a1'] }))).status).toBe(403)
    expect(calls).toHaveLength(0)
    staff = { role: 'secretary', permissions: { beneficiaries: 'edit', maternity: 'edit' } }
    expect((await POST(save({ maternityToDelete: ['a1'] }))).status).toBe(200)
    expect(calls).toContainEqual({ table: 'maternity_aids', op: 'delete' })
  })
  it('אישור לידה דורש גם עריכה ביולדות', async () => {
    const approve = req({ action: 'approve-birth', id: 'b1', aidId: 'a1' })
    staff = { role: 'secretary', permissions: { beneficiaries: 'edit' } }
    expect((await POST(approve)).status).toBe(403)
    staff = { role: 'secretary', permissions: { beneficiaries: 'edit', maternity: 'edit' } }
    expect((await POST(approve)).status).toBe(200)
    expect(calls).toContainEqual({ table: 'maternity_aids', op: 'update' })
  })
})
