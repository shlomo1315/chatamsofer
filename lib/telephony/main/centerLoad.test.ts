import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  acc: null as Record<string, unknown> | null, loaded: false, balance: null as number | null,
  link: { ok: true } as { ok: boolean; error?: string; taken?: boolean },
  load: { result: 'loaded' } as { result: string },
}
const linkCenterCard = vi.fn(async () => state.link)
const runMonthlyLoad = vi.fn(async () => state.load)

vi.mock('@/lib/apiAuth', () => ({ getServiceClient: () => ({}) }))
vi.mock('@/lib/centerMonthlyLoad', () => ({
  findCenterByPhone: async () => state.acc,
  isLoadedThisMonth: async () => state.loaded,
  israelMonth: () => '2026-11',
  normalizeCallerPhone: (p: string) => p,
  getCenterBalanceAgorot: async () => state.balance,
  linkCenterCard: (...a: unknown[]) => (linkCenterCard as (...x: unknown[]) => unknown)(...a),
  runMonthlyLoad: (...a: unknown[]) => (runMonthlyLoad as (...x: unknown[]) => unknown)(...a),
}))

const text = (r: unknown) => JSON.stringify(r)
const run = async (params: Record<string, string> = {}) => {
  const { centerLoad } = await import('./centerLoad')
  return centerLoad({ phone: '0501234567', params, callId: 'c' } as never)
}
const CARD = '1234567890123456'

beforeEach(() => {
  vi.resetModules(); linkCenterCard.mockClear(); runMonthlyLoad.mockClear()
  Object.assign(state, {
    acc: { center_id: 'c1', center_name: 'מוקד א', card_number: null, nedarim_client_id: null },
    loaded: false, balance: null, link: { ok: true }, load: { result: 'loaded' },
  })
})

describe('שיוך ראשון של כרטיס', () => {
  it('בלי כרטיס מבקש 16 ספרות, בלי לשייך', async () => {
    const r = await run()
    expect(text(r)).toContain('16')
    expect(linkCenterCard).not.toHaveBeenCalled()
  })
  it('מספר קצר נדחה', async () => {
    expect(text(await run({ center_card1: '123' }))).toContain('16 ספרות')
    expect(linkCenterCard).not.toHaveBeenCalled()
  })
  it('לפני אישור לא משייך (ניתוק באמצע לא משאיר שיוך)', async () => {
    await run({ center_card1: CARD })
    expect(linkCenterCard).not.toHaveBeenCalled()
  })
  it('אישור 1 משייך פעם אחת', async () => {
    await run({ center_card1: CARD, center_confirm1: '1' })
    expect(linkCenterCard).toHaveBeenCalledTimes(1)
  })
  it('כרטיס שכבר משויך למוקד אחר: הודעה ברורה, בלי טעינה', async () => {
    state.link = { ok: false, error: 'x', taken: true }
    const r = await run({ center_card1: CARD, center_confirm1: '1' })
    expect(text(r)).toContain('משויך למוקד אחר')
    expect(runMonthlyLoad).not.toHaveBeenCalled()
  })
  it('כשל בשיוך (נדרים): פנו למזכירות', async () => {
    state.link = { ok: false, error: 'נדרים' }
    expect(text(await run({ center_card1: CARD, center_confirm1: '1' }))).toContain('פנו למזכירות')
  })
})

describe('אישור הכרטיס בשיחה אמיתית (באג: האישור לא הגיע לשרת)', () => {
  it('אף תשובה לא שולחת removeParams שמוחק את משתנה האישור', async () => {
    const { centerTurn, CENTER_PARAMS } = await import('./centerLoad')
    const st = { cardNumber: null, loadedThisMonth: false }
    const steps = [{}, { center_card1: '123' }, { center_card1: CARD }, { center_card1: CARD, center_confirm1: '2' }, { center_card1: CARD, center_confirm1: '2', center_card2: CARD }]
    for (const p of steps) {
      const r = centerTurn(p, st).result as { removeParams?: string[] }
      expect(r.removeParams ?? []).toEqual([])
    }
    expect(CENTER_PARAMS).toContain('center_confirm1')
  })
  it('תיקון (2) פותח ניסיון חדש בשמות חדשים, ואישור בו משייך', async () => {
    const { centerTurn } = await import('./centerLoad')
    const st = { cardNumber: null, loadedThisMonth: false }
    expect(JSON.stringify(centerTurn({ center_card1: CARD, center_confirm1: '2' }, st).result)).toContain('center_card2')
    const other = '9999888877776666'
    expect(JSON.stringify(centerTurn({ center_card1: CARD, center_confirm1: '2', center_card2: other }, st).result)).toContain('center_confirm2')
    expect(centerTurn({ center_card1: CARD, center_confirm1: '2', center_card2: other, center_confirm2: '1' }, st).link).toBe(other)
  })
  it('אחרי 3 ניסיונות: סיום מנומס', async () => {
    const { centerTurn } = await import('./centerLoad')
    const p = { center_card1: '1', center_card2: '1', center_card3: '1' }
    expect(JSON.stringify(centerTurn(p, { cardNumber: null, loadedThisMonth: false }).result)).toContain('יותר מדי ניסיונות')
  })
})

describe('הקראת יתרה', () => {
  beforeEach(() => { state.acc = { center_id: 'c1', center_name: 'מוקד א', card_number: CARD, nedarim_client_id: '9' } })

  it('בתפריט הטעינה מוקראת היתרה בשקלים ואגורות', async () => {
    state.balance = 73649
    expect(text(await run())).toContain('736 שקלים ו-49 אגורות')
  })
  it('נדרים לא מגיב: אין יתרה אבל השיחה ממשיכה לתפריט הטעינה', async () => {
    state.balance = null
    const t = text(await run())
    expect(t).not.toContain('היתרה')
    expect(t).toContain('לביצוע טעינה')
  })
  it('כבר נטען החודש: מקריא יתרה', async () => {
    state.loaded = true; state.balance = 30000
    const t = text(await run())
    expect(t).toContain('כבר הועברה')
    expect(t).toContain('300 שקלים')
  })
  it('אחרי טעינה מוצלחת מקריא יתרה', async () => {
    state.balance = 60000
    const t = text(await run({ center_go: '1' }))
    expect(runMonthlyLoad).toHaveBeenCalledTimes(1)
    expect(t).toContain('600 שקלים')
  })
  it('אחרי טעינה כשנדרים לא מגיב: הצלחה בלי יתרה', async () => {
    const t = text(await run({ center_go: '1' }))
    expect(t).toContain('הטעינה בוצעה בהצלחה')
    expect(t).not.toContain('היתרה')
  })
})

describe('getCenterBalanceAgorot', () => {
  const mk = async (getClientCard: () => Promise<unknown>) => {
    vi.resetModules()
    vi.doUnmock('@/lib/centerMonthlyLoad')
    vi.doMock('@/lib/nedarim', () => ({ getNedarimCreds: async () => ({}), getClientCard }))
    return (await vi.importActual<typeof import('@/lib/centerMonthlyLoad')>('@/lib/centerMonthlyLoad')).getCenterBalanceAgorot
  }
  it('ממיר שקלים לאגורות', async () => {
    const f = await mk(async () => ({ totalFreeAmount: 736.49 }))
    expect(await f({ nedarim_client_id: '1' })).toBe(73649)
  })
  it('חריגה, null או חוסר client → null', async () => {
    expect(await (await mk(async () => { throw new Error('x') }))({ nedarim_client_id: '1' })).toBeNull()
    expect(await (await mk(async () => null))({ nedarim_client_id: '1' })).toBeNull()
    expect(await (await mk(async () => ({ totalFreeAmount: 1 })))({ nedarim_client_id: null })).toBeNull()
  })
  it('נדרים תקוע: timeout מחזיר null', async () => {
    const f = await mk(() => new Promise(() => {}))
    expect(await f({ nedarim_client_id: '1' }, 20)).toBeNull()
  })
})
