import { beforeEach, describe, expect, it, vi } from 'vitest'

// מריץ את ה-API של מערך המפיצים מול מסד דמה בזיכרון: מה שנשלח מהטופס הוא מה שנשמר.
const rows: Record<string, unknown>[] = []
const ID = '3c3916f2-4a39-41c8-9c93-b1b904b754d3'

function table() {
  let op: 'insert' | 'update' | 'select' = 'select'
  let payload: Record<string, unknown> = {}
  let id: unknown
  const q = {
    insert: (v: Record<string, unknown>) => { op = 'insert'; payload = v; return q },
    update: (v: Record<string, unknown>) => { op = 'update'; payload = v; return q },
    select: () => q,
    eq: (_k: string, v: unknown) => { id = v; return q },
    maybeSingle: async () => ({ data: rows.find(r => r.id === id) ?? null }),
    single: async () => {
      if (op === 'insert') { const r = { id: ID, status: 'active', ...payload }; rows.push(r); return { data: r, error: null } }
      const r = rows.find(x => x.id === id)!
      Object.assign(r, payload)
      return { data: r, error: null }
    },
    then: (res: (v: unknown) => void) => res({ error: null }),
  }
  return q
}

vi.mock('@/lib/apiAuth', () => ({
  requirePermission: async () => ({ userId: 'u1' }),
  forbidden: () => new Response(null, { status: 403 }),
  serverMisconfigured: () => new Response(null, { status: 500 }),
  getServiceClient: () => ({ from: () => table() }),
}))
vi.mock('@/lib/activityLog', () => ({ logActivity: async () => {} }))

const { POST, PATCH } = await import('@/app/api/admin/gilyonot/distributors/route')
const call = (fn: (r: Request) => Promise<Response>, method: string, body: unknown) =>
  fn(new Request('http://x/api/admin/gilyonot/distributors', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

// בדיוק מה שהטופס "מפיץ חדש" שולח: כל השדות כמחרוזות, ריקים כ-''
const form = { full_name: 'שלמה טסט', city: 'עמנואל', synagogue: '', address: '', phone: '052-123-4567', phone2: '', email: '', id_number: '', quantity: '88', route: '', notes: '' }

describe('API מפיצים: הוספה ידנית ועריכה', () => {
  beforeEach(() => { rows.length = 0 })

  it('מפיץ חדש נשמר עם הטלפון ופעיל מיד', async () => {
    const res = await call(POST, 'POST', { mode: 'add', ...form })
    expect(res.status).toBe(200)
    expect(rows[0]).toMatchObject({ full_name: 'שלמה טסט', phone: '0521234567', quantity: 88, status: 'active', source: 'manual' })
  })

  it('בלי טלפון: לא נשמר, והודעה ברורה', async () => {
    const res = await call(POST, 'POST', { mode: 'add', ...form, phone: '' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('חובה למלא מספר טלפון')
    expect(rows).toHaveLength(0)
  })

  it('טלפון לא תקין: לא נשמר', async () => {
    const res = await call(POST, 'POST', { mode: 'add', ...form, phone: '12' })
    expect((await res.json()).error).toBe('מספר טלפון לא תקין')
    expect(rows).toHaveLength(0)
  })

  it('עריכה מוסיפה טלפון למפיץ קיים', async () => {
    rows.push({ id: ID, full_name: 'שלמה טסט', phone: null, city: 'עמנואל', quantity: 88, status: 'active' })
    const res = await call(PATCH, 'PATCH', { id: ID, fields: { ...form, phone: '0541112233' } })
    expect(res.status).toBe(200)
    expect(rows[0]).toMatchObject({ phone: '0541112233', status: 'active' })
  })

  it('עריכה בלי טלפון נחסמת', async () => {
    rows.push({ id: ID, full_name: 'שלמה טסט', phone: null, quantity: 88, status: 'active' })
    const res = await call(PATCH, 'PATCH', { id: ID, fields: { ...form, phone: '' } })
    expect(res.status).toBe(400)
    expect(rows[0].phone).toBeNull()
  })
})
