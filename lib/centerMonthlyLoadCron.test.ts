import { describe, it, expect, vi, beforeEach } from 'vitest'

const runMonthlyLoad = vi.fn()
const deliverMail = vi.fn(async () => undefined)
let rows: { id: string; name: string; is_active: boolean }[] = []
let cardRows: unknown[] = []
const upsert = vi.fn(async () => ({ error: null }))

vi.mock('@/lib/apiAuth', () => ({
  verifyCronSecret: (req: Request) => req.headers.get('authorization') === 'Bearer s3',
  getServiceClient: () => ({
    from: (t: string) => t === 'card_centers'
      ? { select: () => ({ eq: async () => ({ data: rows.filter(r => r.is_active), error: null }) }) }
      : { select: async () => ({ data: cardRows, error: null }), upsert },
  }),
}))
vi.mock('@/lib/centerMonthlyLoad', () => ({ runMonthlyLoad: (...a: unknown[]) => runMonthlyLoad(...a), israelMonth: () => '2026-11' }))
vi.mock('@/lib/cardStock', () => ({ getStockBalance: async () => 42, getAlertSettings: async () => ({ thresholds: [30], emails: ['a@x.com'] }) }))
vi.mock('@/lib/sendMail', () => ({ deliverMail: (...a: unknown[]) => deliverMail(...(a as [])) }))
vi.mock('@/lib/departments', () => ({ mailFor: () => ({}) }))

const row = (id: string, name: string, active = true) => ({ id, name, is_active: active })
const call = async (auth = 'Bearer s3') => {
  const { GET } = await import('@/app/api/cron/center-monthly-load/route')
  return GET(new Request('http://x/api/cron/center-monthly-load', { headers: { authorization: auth } }) as never)
}

beforeEach(() => {
  vi.resetModules(); runMonthlyLoad.mockReset(); deliverMail.mockClear(); upsert.mockClear(); cardRows = []
  process.env.CRON_SECRET = 's3'
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

describe('cron טעינה חודשית למוקדים', () => {
  it('בלי סוד נכון: 401 ואין טעינה', async () => {
    rows = [row('1', 'א')]
    expect((await call('Bearer bad')).status).toBe(401)
    expect(runMonthlyLoad).not.toHaveBeenCalled()
  })

  it('טוען כל מוקד פעיל, מדלג על לא פעיל, וכשל באחד לא עוצר את האחרים', async () => {
    rows = [row('1', 'א'), row('2', 'ב', false), row('3', 'ג'), row('4', 'ד')]
    runMonthlyLoad.mockImplementation(async (_db: unknown, acc: { center_id: string }) => {
      if (acc.center_id === '3') throw new Error('boom')
      return { result: 'loaded' }
    })
    const body = await (await call()).json()
    expect(runMonthlyLoad).toHaveBeenCalledTimes(3)
    expect(body.summary).toEqual({ loaded: 2, error: 1 })
  })

  it('no_stock: מתריע במייל ולא נכשל', async () => {
    rows = [row('1', 'א')]
    runMonthlyLoad.mockResolvedValue({ result: 'no_stock' })
    const res = await call()
    expect(res.status).toBe(200)
    expect(deliverMail).toHaveBeenCalledTimes(1)
  })

  it('מוקד בלי שורת חשבון (בלי כרטיס): השורה נוצרת והוא נטען', async () => {
    rows = [row('1', 'א'), row('2', 'ב')]
    cardRows = [{ center_id: '2', card_number: '5', nedarim_client_id: '77' }]
    runMonthlyLoad.mockResolvedValue({ result: 'loaded' })
    await call()
    expect(upsert).toHaveBeenCalledWith([{ center_id: '1' }], expect.anything())
    expect(runMonthlyLoad).toHaveBeenCalledTimes(2)
    const accs = runMonthlyLoad.mock.calls.map(c => c[1] as { center_id: string; nedarim_client_id: string | null })
    expect(accs.find(a => a.center_id === '2')?.nedarim_client_id).toBe('77')
    expect(accs.find(a => a.center_id === '1')?.nedarim_client_id).toBeNull()
  })

  it('מייל סיכום למנהל: שם, סכום, תוקף, מצב ומלאי שנשאר', async () => {
    rows = [row('1', 'מוקד א'), row('2', 'מוקד ב')]
    runMonthlyLoad.mockImplementation(async (_d: unknown, acc: { center_id: string }) =>
      acc.center_id === '1' ? { result: 'loaded', amount: 600, expiresAt: '2027-01-11' } : { result: 'no_stock' })
    await call()
    expect(deliverMail).toHaveBeenCalledTimes(1)
    const [to, subject, html] = deliverMail.mock.calls[0] as unknown as [string, string, string]
    expect(to).toBe('a@x.com')
    expect(subject).toContain('1 נטענו')
    expect(html).toContain('מוקד א')
    expect(html).toContain('600 ₪')
    expect(html).toContain('11/01/2027')
    expect(html).toContain('אין מלאי')
    expect(html).toContain('42')
  })

  it('ריצה כפולה באותו חודש: already, בלי מייל נוסף', async () => {
    rows = [row('1', 'א')]
    runMonthlyLoad.mockResolvedValueOnce({ result: 'loaded' }).mockResolvedValueOnce({ result: 'already' })
    expect((await (await call()).json()).summary).toEqual({ loaded: 1 })
    expect(deliverMail).toHaveBeenCalledTimes(1)
    expect((await (await call()).json()).summary).toEqual({ already: 1 })
    expect(deliverMail).toHaveBeenCalledTimes(1)
  })
})

describe('runMonthlyLoad: כפילות', () => {
  it('שריון שחזר already לא פונה לנדרים', async () => {
    vi.doUnmock('@/lib/centerMonthlyLoad')
    const addTlush = vi.fn()
    vi.doMock('@/lib/nedarim', () => ({
      getNedarimCreds: async () => ({}), getCenterLimitedId: async () => undefined,
      findClientByTsad3: async () => null, saveClientCard: async () => null, setMagneticCard: async () => ({ ok: true }), addTlush,
    }))
    const { runMonthlyLoad: real } = await vi.importActual<typeof import('@/lib/centerMonthlyLoad')>('@/lib/centerMonthlyLoad')
    const admin = {
      rpc: async () => ({ data: 'already', error: null }),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    }
    const r = await real(admin as never, { center_id: 'c', center_name: 'מ', nedarim_client_id: '1' } as never)
    expect(r.result).toBe('already')
    expect(addTlush).not.toHaveBeenCalled()
  })
})

describe('runMonthlyLoad: הקמת לקוח והורדת מלאי', () => {
  it('בלי לקוח: מוקם בשם המוקד, נשמר, המלאי מנוכה בשריון והטעינה ל-600 לחודשיים', async () => {
    vi.doUnmock('@/lib/centerMonthlyLoad')
    const addTlush = vi.fn(async () => ({ ok: true, tlushId: 't1' }))
    const saveClientCard = vi.fn(async () => '555')
    vi.doMock('@/lib/nedarim', () => ({
      getNedarimCreds: async () => ({}), getCenterLimitedId: async () => 'g1',
      findClientByTsad3: async () => null, saveClientCard, setMagneticCard: async () => ({ ok: true }), addTlush,
    }))
    const { runMonthlyLoad: real } = await vi.importActual<typeof import('@/lib/centerMonthlyLoad')>('@/lib/centerMonthlyLoad')
    const rpc = vi.fn(async () => ({ data: 'ok', error: null }))
    const updates: unknown[] = []
    const admin = {
      rpc,
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        update: (v: unknown) => { updates.push(v); return { eq: () => ({ eq: async () => ({}) , then: (r: (x: unknown) => void) => r({}) }) } },
      }),
    }
    const now = new Date('2026-12-01T08:00:00Z')
    const r = await real(admin as never, { center_id: 'c1', center_name: 'מוקד בני ברק', phone: null, card_number: null, nedarim_client_id: null, id_number: null } as never, now)
    expect(r).toMatchObject({ result: 'loaded', amount: 600, expiresAt: '2027-02-01' })
    expect(saveClientCard).toHaveBeenCalledWith({}, expect.objectContaining({ full_name: 'מוקד בני ברק', id_number: 'center-c1' }), null, 'מוקדים')
    expect(updates[0]).toMatchObject({ nedarim_client_id: '555', id_number: 'center-c1' })
    expect(rpc).toHaveBeenCalledWith('reserve_center_monthly_load', { p_center: 'c1', p_month: '2026-12', p_amount: 600 })
    expect(addTlush).toHaveBeenCalledWith({}, '555', 600, '01/02/2027', expect.any(String), 'g1')
  })

  it('אין מלאי: לא פונה לנדרים ולא מקים לקוח', async () => {
    vi.doUnmock('@/lib/centerMonthlyLoad')
    const addTlush = vi.fn(); const saveClientCard = vi.fn()
    vi.doMock('@/lib/nedarim', () => ({
      getNedarimCreds: async () => ({}), getCenterLimitedId: async () => undefined,
      findClientByTsad3: async () => null, saveClientCard, setMagneticCard: async () => ({ ok: true }), addTlush,
    }))
    const { runMonthlyLoad: real } = await vi.importActual<typeof import('@/lib/centerMonthlyLoad')>('@/lib/centerMonthlyLoad')
    const admin = {
      rpc: async () => ({ data: 'no_stock', error: null }),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    }
    const r = await real(admin as never, { center_id: 'c1', center_name: 'מ', nedarim_client_id: null } as never)
    expect(r.result).toBe('no_stock')
    expect(addTlush).not.toHaveBeenCalled()
    expect(saveClientCard).not.toHaveBeenCalled()
  })
})
