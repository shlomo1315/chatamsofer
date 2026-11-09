import { describe, it, expect, vi, beforeEach } from 'vitest'

// מסד דמה בזיכרון: משתמש בדיקה שנוצר כאן, בלי נתונים חיים
const db: Record<string, Record<string, unknown>[]> = {}
let failBlock = false
let sessionId: string | null = null

vi.mock('@/lib/portalSession', () => ({ getPortalBeneficiaryId: () => sessionId }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({})) }))
vi.mock('@/lib/apiAuth', () => ({
  getServiceClient: () => ({
    from: (t: string) => {
      const rows = (db[t] ??= [])
      const q = {
        select: () => q, eq: (c: string, v: unknown) => { (q as { f?: [string, unknown] }).f = [c, v]; return q },
        maybeSingle: async () => {
          const f = (q as { f?: [string, unknown] }).f
          return { data: rows.find(r => r[f![0]] === f![1]) ?? null }
        },
        upsert: async (list: Record<string, unknown>[]) => {
          if (failBlock) return { error: { message: 'x' } }
          list.forEach(r => rows.push(r)); return { error: null }
        },
        delete: () => ({
          eq: async (c: string, v: unknown) => { db[t] = rows.filter(r => r[c] !== v); return { error: null } },
        }),
      }
      return q
    },
  }),
}))

import { POST } from '@/app/api/portal/delete-account/route'

const req = (body: unknown) => ({ json: async () => body }) as never

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  db.beneficiaries = [{ id: 'b1', id_number: '012345678', spouse_id_number: '087654321', email: 't@example.com', family_name: 'בדיקה' }]
  db.documents = [{ beneficiary_id: 'b1' }]
  failBlock = false; sessionId = 'b1'
})

describe('מחיקה עצמית מהאיגוד', () => {
  it('בלי סשן: 401 ולא נמחק דבר', async () => {
    sessionId = null
    expect((await POST(req({ confirm: 'מחיקה', understood: true }))).status).toBe(401)
    expect(db.beneficiaries).toHaveLength(1)
  })
  it('בלי אישור מלא: 400', async () => {
    expect((await POST(req({ confirm: 'מחיקה', understood: false }))).status).toBe(400)
    expect((await POST(req({ confirm: 'x', understood: true }))).status).toBe(400)
    expect(db.beneficiaries).toHaveLength(1)
  })
  it('אישור תקין: מוחק, וחוסם ת"ז הבעל והאישה', async () => {
    const res = await POST(req({ confirm: 'מחיקה', understood: true }))
    expect(res.status).toBe(200)
    expect(db.beneficiaries).toHaveLength(0)
    expect(db.documents).toHaveLength(0)
    const blocked = db.removed_members.map(r => r.id_number)
    expect(blocked).toEqual(expect.arrayContaining(['012345678', '12345678', '087654321']))
  })
  it('נכשל-סגור: אם החסימה נכשלה, לא מוחקים', async () => {
    failBlock = true
    expect((await POST(req({ confirm: 'מחיקה', understood: true }))).status).toBe(500)
    expect(db.beneficiaries).toHaveLength(1)
  })
})
