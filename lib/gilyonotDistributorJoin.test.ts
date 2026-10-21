import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// טופס ההצטרפות למפיצים: אימות, חסימת טלפון של מפיץ קיים (בלי לחשוף שם),
// בקשה כפולה, וזרימת ההגשה והאישור עד יצירת המפיץ ומייל האישור.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
let seq = 0

// מסד מדומה: מספיק לשאילתות של הטופס ושל מסלול האישור
function fakeDb() {
  return {
    from(table: string) {
      const rows = () => (tables[table] ??= [])
      const filters: ((r: Row) => boolean)[] = []
      let op: 'select' | 'insert' | 'update' = 'select'
      let payload: Row = {}
      let returning = false
      let limitN = Infinity
      let one: 'single' | 'maybe' | null = null
      const run = () => {
        if (op === 'insert') {
          const row: Row = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, status: 'active', ...payload }
          if (table === 'gilyonot_distributor_applications' && row.reason === 'web' && row.status === 'pending'
            && rows().some(r => r.reason === 'web' && r.status === 'pending' && r.phone === row.phone)) {
            return { data: null, error: { code: '23505', message: 'duplicate' } }
          }
          rows().push(row)
          return { data: one ? row : [row], error: null }
        }
        const hit = rows().filter(r => filters.every(f => f(r)))
        if (op === 'update') {
          hit.forEach(r => Object.assign(r, payload))
          return { data: returning ? hit.map(r => ({ id: r.id })) : null, error: null }
        }
        const out = hit.slice(0, limitN)
        if (one) return { data: out[0] ?? null, error: one === 'single' && !out[0] ? { message: 'none' } : null }
        return { data: out, error: null }
      }
      const q = {
        select() { if (op === 'select') return q; returning = true; return q },
        insert(v: Row) { op = 'insert'; payload = v; return q },
        update(v: Row) { op = 'update'; payload = v; return q },
        eq(k: string, v: unknown) { filters.push(r => r[k] === v); return q },
        not(k: string, _o: string, v: unknown) { filters.push(r => r[k] !== v && r[k] !== undefined); return q },
        or(expr: string) {
          const parts = expr.split(',').map(p => { const [k, , ...v] = p.split('.'); return [k, v.join('.')] as const })
          filters.push(r => parts.some(([k, v]) => r[k] === v)); return q
        },
        order() { return q },
        limit(n: number) { limitN = n; return q },
        range(a: number, b: number) { limitN = b - a + 1; return q },
        maybeSingle() { one = 'maybe'; return Promise.resolve(run()) },
        single() { one = 'single'; return Promise.resolve(run()) },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(run()).then(res, rej) },
      }
      return q
    },
  }
}

const db = fakeDb()
const deliverMail = vi.fn()
const requirePermission = vi.fn()
vi.mock('@/lib/sendMail', () => ({ deliverMail: (...a: unknown[]) => deliverMail(...a) }))
vi.mock('@/lib/activityLog', () => ({ logActivity: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: () => true, clientIpOrNull: () => '1.2.3.4' }))
vi.mock('@/lib/apiAuth', () => ({
  getServiceClient: () => db,
  serverMisconfigured: () => new Response('misconfigured', { status: 500 }),
  requirePermission: () => requirePermission(),
  forbidden: () => new Response('forbidden', { status: 403 }),
}))
vi.mock('@/lib/gilyonotDistributorServer', async (orig) => ({
  ...(await orig<typeof import('./gilyonotDistributorServer')>()),
  loadDistributorSettings: async () => ({ agent_phone: '0527000000' }),
}))

const { validateJoinRequest, submitJoinRequest, joinApprovedMail, joinCities, PHONE_TAKEN_MESSAGE, PENDING_EXISTS_MESSAGE } = await import('./gilyonotDistributorJoin')
const joinRoute = await import('@/app/api/gilyonot/mefitz/join/route')
const appsRoute = await import('@/app/api/admin/gilyonot/distributors/applications/route')

const valid = { full_name: 'משה כהן', phone: '052-123-4567', email: 'Moshe@Example.com', city: 'בני ברק', synagogue: 'בית כנסת הגדול', quantity: '40', notes: 'בימי שישי' }
const post = (body: unknown) => joinRoute.POST(new Request('http://x/api/gilyonot/mefitz/join', { method: 'POST', body: JSON.stringify(body) }))
const patch = (body: unknown) => appsRoute.PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }))

beforeEach(() => {
  tables = {
    gilyonot_distributors: [{ id: 'd1', full_name: 'יעקב לוי', phone: '0541112222', phone2: '0549998888', city: 'ירושלים', status: 'active' }],
    gilyonot_distributor_applications: [],
    gilyonot_distributor_events: [],
  }
  deliverMail.mockReset().mockResolvedValue({ ok: true })
  requirePermission.mockReset().mockResolvedValue({ userId: 'staff1' })
})

describe('validateJoinRequest', () => {
  it('מנרמל טלפון, מייל וכמות', () => {
    const r = validateJoinRequest(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toMatchObject({ phone: '0521234567', email: 'moshe@example.com', quantity: 40, city: 'בני ברק', notes: 'בימי שישי' })
  })

  it.each([
    [{ full_name: '' }, 'נא להזין שם מלא'],
    [{ phone: '123' }, 'נא להזין מספר טלפון תקין'],
    [{ email: 'לא מייל' }, 'נא להזין כתובת מייל תקינה'],
    [{ city: '' }, 'נא לבחור עיר לחלוקה'],
    [{ quantity: 'הרבה' }, 'הכמות צריכה להיות מספר שלם'],
  ])('דוחה שדה לא תקין %#', (patchFields, error) => {
    expect(validateJoinRequest({ ...valid, ...patchFields })).toEqual({ ok: false, error })
  })
})

describe('הגשה', () => {
  it('שומרת בקשה ממתינה מסוג web', async () => {
    const res = await post(valid)
    expect(res.status).toBe(200)
    expect(tables.gilyonot_distributor_applications).toEqual([expect.objectContaining({
      full_name: 'משה כהן', phone: '0521234567', email: 'moshe@example.com', reason: 'web', status: 'pending', quantity: 40, notes: 'בימי שישי',
    })])
  })

  it('טלפון של מפיץ קיים (גם טלפון שני) נחסם בלי לחשוף את שמו', async () => {
    for (const phone of ['054-111-2222', '0549998888']) {
      const res = await post({ ...valid, phone })
      const body = await res.json()
      expect(res.status).toBe(409)
      expect(body).toEqual({ error: PHONE_TAKEN_MESSAGE, code: 'phone_taken' })
      expect(JSON.stringify(body)).not.toContain('יעקב')
    }
    expect(tables.gilyonot_distributor_applications).toHaveLength(0)
  })

  it('מפיץ שעזב לא חוסם הרשמה מחדש', async () => {
    tables.gilyonot_distributors[0].status = 'inactive'
    expect((await post({ ...valid, phone: '0541112222' })).status).toBe(200)
  })

  it('בקשה שנייה מאותו טלפון נחסמת כל עוד הראשונה ממתינה', async () => {
    await post(valid)
    const res = await post({ ...valid, full_name: 'שם אחר' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(PENDING_EXISTS_MESSAGE)
    expect(tables.gilyonot_distributor_applications).toHaveLength(1)
  })

  it('הגשה כפולה באותו רגע (23505) מתורגמת לבקשה ממתינה', async () => {
    const v = validateJoinRequest(valid)
    if (!v.ok) throw new Error('invalid')
    // מדמה מרוץ: הבדיקה המקדימה לא ראתה את הבקשה, אבל האינדקס הייחודי עוצר
    tables.gilyonot_distributor_applications.push({ id: 'x', phone: '0521234567', reason: 'web', status: 'pending' })
    const fake = fakeDb()
    const realFrom = fake.from
    let calls = 0
    fake.from = (t: string) => {
      const q = realFrom(t)
      if (t === 'gilyonot_distributor_applications' && calls++ === 0) q.limit = () => Promise.resolve({ data: [], error: null }) as never
      return q
    }
    expect(await submitJoinRequest(fake as never, v.value)).toEqual({ ok: false, code: 'pending_exists', error: PENDING_EXISTS_MESSAGE })
  })

  it('שדה המלכודת לבוטים: מחזיר הצלחה ולא שומר', async () => {
    const res = await post({ ...valid, website: 'http://spam' })
    expect(res.status).toBe(200)
    expect(tables.gilyonot_distributor_applications).toHaveLength(0)
  })

  it('קלט לא תקין מחזיר 400', async () => {
    expect((await post({ ...valid, email: '' })).status).toBe(400)
    expect((await post([1, 2])).status).toBe(400)
  })
})

describe('אישור', () => {
  it('אישור בקשה מהטופס יוצר מפיץ פעיל ושולח מייל עם הפרטים', async () => {
    await post(valid)
    const app = tables.gilyonot_distributor_applications[0]
    const res = await patch({ id: app.id, status: 'approved' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, mailed: true })

    const created = tables.gilyonot_distributors.find(d => d.phone === '0521234567')
    expect(created).toMatchObject({ full_name: 'משה כהן', city: 'בני ברק', quantity: 40, notes: 'בימי שישי', source: 'web', status: 'active' })
    expect(app).toMatchObject({ status: 'approved', distributor_id: created!.id, handled_by: 'staff1' })
    expect(tables.gilyonot_distributor_events).toEqual([expect.objectContaining({ distributor_id: created!.id, channel: 'web', kind: 'join' })])

    expect(deliverMail).toHaveBeenCalledTimes(1)
    const [to, subject, html] = deliverMail.mock.calls[0]
    expect(to).toBe('moshe@example.com')
    expect(subject).toBe('אושרה הצטרפותך למערך המפיצים')
    for (const s of ['משה כהן', '0521234567', 'בני ברק', 'בית כנסת הגדול', '40', '/gilyonot/mefitz', '0527000000']) expect(html).toContain(s)

    // אחרי האישור אותו טלפון כבר רשום
    expect((await (await post(valid)).json()).code).toBe('phone_taken')
  })

  it('לחיצה כפולה על אישור לא יוצרת מפיץ שני ולא שולחת מייל שני', async () => {
    await post(valid)
    const id = tables.gilyonot_distributor_applications[0].id
    await patch({ id, status: 'approved' })
    expect((await patch({ id, status: 'approved' })).status).toBe(409)
    expect(tables.gilyonot_distributors.filter(d => d.phone === '0521234567')).toHaveLength(1)
    expect(deliverMail).toHaveBeenCalledTimes(1)
  })

  it('דחייה לא יוצרת מפיץ ולא שולחת מייל', async () => {
    await post(valid)
    const app = tables.gilyonot_distributor_applications[0]
    expect((await patch({ id: app.id, status: 'dismissed' })).status).toBe(200)
    expect(app.status).toBe('dismissed')
    expect(tables.gilyonot_distributors).toHaveLength(1)
    expect(deliverMail).not.toHaveBeenCalled()
  })

  it('בקשה מנדרים: נוסף מפיץ בלי מייל, כמו קודם', async () => {
    tables.gilyonot_distributor_applications.push({ id: '00000000-0000-4000-8000-000000000999', full_name: 'אהרן', phone: '0533333333', email: 'a@b.co', reason: 'synagogue_taken', status: 'pending' })
    expect((await patch({ id: '00000000-0000-4000-8000-000000000999', status: 'approved' })).status).toBe(200)
    expect(tables.gilyonot_distributors.find(d => d.phone === '0533333333')).toMatchObject({ source: 'nedarim' })
    expect(deliverMail).not.toHaveBeenCalled()
  })

  it('בלי הרשאה: 403', async () => {
    requirePermission.mockResolvedValue(null)
    expect((await patch({ id: '00000000-0000-4000-8000-000000000001', status: 'approved' })).status).toBe(403)
  })
})

describe('מייל ורשימת ערים', () => {
  it('מייל האישור מבריח HTML ומדלג על שדות ריקים', () => {
    const { html } = joinApprovedMail({ full_name: '<b>x</b>', phone: '0521234567', email: null, city: 'אלעד', synagogue: null, address: null, quantity: null }, null)
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).not.toContain('בית כנסת')
    expect(html).toContain('<a href=')
  })

  it('רשימת הערים: ייחודיות, מפיצים פעילים בלבד, לפי א"ב', async () => {
    tables.gilyonot_distributors.push(
      { id: 'd2', city: 'בני ברק', status: 'active' }, { id: 'd3', city: 'אשדוד', status: 'active' },
      { id: 'd4', city: 'בני ברק', status: 'active' }, { id: 'd5', city: 'חדרה', status: 'inactive' }, { id: 'd6', city: null, status: 'active' },
    )
    expect(await joinCities(db as never)).toEqual(['אשדוד', 'בני ברק', 'ירושלים'])
  })
})
