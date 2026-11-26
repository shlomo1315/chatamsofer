import { describe, it, expect, vi, beforeEach } from 'vitest'
import { roleAllows } from '@/lib/permissions'
import type { SectionKey } from '@/types'

// איש הצוות המחובר — נקבע בכל בדיקה. ההכרעה עצמה היא הפונקציה האמיתית
// מ-lib/permissions, כמו ב-requirePermission.
type Staff = { role: 'admin' | 'secretary' | 'reviewer'; permissions: Record<string, string> } | null
let staff: Staff = null
const calls: { table: string; op: string }[] = []
// הרשומה הקיימת (לבדיקת שדות המזהה) ומה שנכתב בפועל
let current: Record<string, unknown> | null = null
let written: Record<string, unknown> | null = null

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
      let cols = ''
      Object.assign(q, {
        select: (c: string) => { cols = c; return q }, eq: chain, neq: chain, in: chain, limit: chain,
        maybeSingle: async () => ({ data: cols.includes('id_doc_type') ? current : null }),
        update: (row: Record<string, unknown>) => { calls.push({ table, op: 'update' }); if (table === 'beneficiaries') written = row; return { eq: () => ({ eq: async () => ({ error: null }), then: (r: (v: unknown) => void) => r({ error: null }) }) } },
        delete: () => { calls.push({ table, op: 'delete' }); return { in: () => ({ eq: async () => ({ error: null }) }) } },
      })
      return q
    },
  }),
}))

import { POST } from '@/app/api/admin/beneficiaries/update/route'

const req = (body: unknown) => ({ json: async () => body }) as never
const save = (extra: Record<string, unknown> = {}) => req({ action: 'save', id: 'b1', payload: { phone: '0501234567' }, ...extra })

beforeEach(() => { staff = null; calls.length = 0; current = null; written = null })

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

describe('החלפת ת.ז. ↔ דרכון בעריכת כרטסת', () => {
  const doc = (payload: Record<string, unknown>) => req({ action: 'save', id: 'b1', payload })
  beforeEach(() => { current = { id_number: '123456782', id_doc_type: 'id', spouse_id_number: 'AB12345', spouse_doc_type: 'passport' } })

  it('מזכירה מחליפה ת.ז. לדרכון — נשמרים הסוג והמספר', async () => {
    staff = { role: 'secretary', permissions: { beneficiaries: 'edit' } }
    expect((await POST(doc({ id_number: ' P9876543 ', id_doc_type: 'passport' }))).status).toBe(200)
    expect(written).toMatchObject({ id_number: 'P9876543', id_doc_type: 'passport' })
  })
  it('מנהל מחליף דרכון של האישה לת.ז. תקינה', async () => {
    staff = { role: 'admin', permissions: {} }
    expect((await POST(doc({ spouse_id_number: '000000018', spouse_doc_type: 'id' }))).status).toBe(200)
    expect(written).toMatchObject({ spouse_id_number: '000000018', spouse_doc_type: 'id' })
  })
  it('החלפה לת.ז. כשהמספר הוא עדיין מספר דרכון — נחסמת', async () => {
    staff = { role: 'admin', permissions: {} }
    expect((await POST(doc({ spouse_id_number: 'AB12345', spouse_doc_type: 'id' }))).status).toBe(400)
    expect(written).toBeNull()
  })
  it('ת.ז. לא תקינה, דרכון קצר או סוג לא מוכר — 400', async () => {
    staff = { role: 'admin', permissions: {} }
    expect((await POST(doc({ id_number: '123456789', id_doc_type: 'id' }))).status).toBe(400)
    expect((await POST(doc({ id_number: 'AB1', id_doc_type: 'passport' }))).status).toBe(400)
    expect((await POST(doc({ id_number: '123456782', id_doc_type: 'visa' }))).status).toBe(400)
    expect(written).toBeNull()
  })
  it('ערך ישן שלא השתנה לא חוסם שמירה', async () => {
    current = { id_number: '12345', id_doc_type: 'id', spouse_id_number: null, spouse_doc_type: null }
    staff = { role: 'admin', permissions: {} }
    expect((await POST(doc({ id_number: '12345', id_doc_type: 'id', phone: '0501234567' }))).status).toBe(200)
  })
  it('משתמש בלי הרשאת עריכה או לא מחובר — לא יכול להחליף', async () => {
    const swap = () => doc({ id_number: 'P9876543', id_doc_type: 'passport' })
    staff = { role: 'secretary', permissions: { beneficiaries: 'view' } }
    expect((await POST(swap())).status).toBe(403)
    staff = { role: 'reviewer', permissions: {} }
    expect((await POST(swap())).status).toBe(403)
    staff = null
    expect((await POST(swap())).status).toBe(403)
    expect(calls).toHaveLength(0)
  })
})
