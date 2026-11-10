import { describe, it, expect, vi, beforeEach } from 'vitest'

const runMonthlyLoad = vi.fn()
const deliverMail = vi.fn(async () => undefined)
let rows: unknown[] = []

vi.mock('@/lib/apiAuth', () => ({
  verifyCronSecret: (req: Request) => req.headers.get('authorization') === 'Bearer s3',
  getServiceClient: () => ({
    from: () => ({ select: () => ({ not: async () => ({ data: rows, error: null }) }) }),
  }),
}))
vi.mock('@/lib/centerMonthlyLoad', () => ({ runMonthlyLoad: (...a: unknown[]) => runMonthlyLoad(...a) }))
vi.mock('@/lib/cardStock', () => ({ getAlertSettings: async () => ({ thresholds: [30], emails: ['a@x.com'] }) }))
vi.mock('@/lib/sendMail', () => ({ deliverMail: (...a: unknown[]) => deliverMail(...(a as [])) }))
vi.mock('@/lib/departments', () => ({ mailFor: () => ({}) }))

const row = (id: string, name: string, active = true) => ({ center_id: id, card_number: '1', card_centers: { name, is_active: active } })
const call = async (auth = 'Bearer s3') => {
  const { GET } = await import('@/app/api/cron/center-monthly-load/route')
  return GET(new Request('http://x/api/cron/center-monthly-load', { headers: { authorization: auth } }) as never)
}

beforeEach(() => {
  vi.resetModules(); runMonthlyLoad.mockReset(); deliverMail.mockClear()
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

  it('ריצה כפולה באותו חודש: already, בלי התראה', async () => {
    rows = [row('1', 'א')]
    runMonthlyLoad.mockResolvedValueOnce({ result: 'loaded' }).mockResolvedValueOnce({ result: 'already' })
    expect((await (await call()).json()).summary).toEqual({ loaded: 1 })
    expect((await (await call()).json()).summary).toEqual({ already: 1 })
    expect(deliverMail).not.toHaveBeenCalled()
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
