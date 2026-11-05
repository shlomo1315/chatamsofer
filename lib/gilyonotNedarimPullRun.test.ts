import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: URLSearchParams[] = []
let handler: (p: URLSearchParams) => unknown[]
vi.mock('./nedarimFetch', () => ({
  nedarimFetch: async (_u: string, init: { body: URLSearchParams }) => {
    calls.push(init.body)
    return { ok: true, status: 200, text: async () => JSON.stringify(handler(init.body)) }
  },
}))
vi.mock('./apiAuth', () => ({ getServiceClient: () => null }))
const subscribe = vi.fn(async () => ({ ok: true, outcome: 'added' }))
vi.mock('./gilyonot', async (orig) => ({ ...(await orig<object>()), subscribeGilyonot: (...a: unknown[]) => (subscribe as (...x: unknown[]) => unknown)(...a) }))

import { pullNedarimSubscribers, fetchRows, EMPTY_FORM_ERROR } from './gilyonotNedarimPull'

function fakeDb(initial: Record<string, unknown>) {
  const store: Record<string, string> = {}
  for (const [k, v] of Object.entries(initial)) store[k] = JSON.stringify(v)
  return {
    store,
    from: () => ({
      select: () => ({ eq: (_c: string, key: string) => ({ maybeSingle: async () => ({ data: store[key] ? { value: store[key] } : null }) }) }),
      upsert: async (row: { key: string; value: string }) => { store[row.key] = row.value; return { error: null } },
    }),
  }
}
const cfg = { mosadId: '7014553', apiKey: 'k', tofesId: '3345', emailField: 'Field9', nameField: 'Field7', consentField: '' }
const recs = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ ID: String(from + i), Field9: `u${from + i}@x.com`, Field7: 'שם' }))

beforeEach(() => { calls.length = 0; subscribe.mockClear() })

describe('גיליונות נדרים: משיכה ראשונה', () => {
  it('Desc בלי LastId כשאין גבול עליון', async () => {
    handler = () => []
    await fetchRows(cfg, ['Field9'], { lastId: 0, max: 30, desc: true })
    expect(calls[0].get('Order')).toBe('Desc')
    expect(calls[0].has('LastId')).toBe(false)
  })

  it('משיכה ראשונה קוראת את כל העמודים, והריצה הבאה רק חדשות', async () => {
    const all = recs(1, 1200)
    handler = p => { const last = Number(p.get('LastId') ?? 0); return all.filter(r => Number(r.ID) > last).slice(0, Number(p.get('MaxId'))) }
    const db = fakeDb({ gilyonot_nedarim_config: cfg })
    const r1 = await pullNedarimSubscribers(db as never)
    expect(r1.ok).toBe(true)
    expect(r1.read).toBe(1200)
    expect(r1.added).toBe(1200)
    expect(r1.lastId).toBe(1200)

    all.push(...recs(1201, 1203))
    subscribe.mockClear()
    const r2 = await pullNedarimSubscribers(db as never)
    expect(r2.read).toBe(3)
    expect(r2.added).toBe(3)
    expect(subscribe).toHaveBeenCalledTimes(3)
  })

  it('זיהוי עמודת מייל: דוגמת Desc ריקה נופלת לסדר רגיל', async () => {
    const all = recs(1, 5).map(r => ({ ...r, Field9: r.Field9 }))
    handler = p => {
      if (p.get('Order') === 'Desc' && p.get('LastId') === '0') return []
      if (p.get('MaxId') === '30') return all
      const last = Number(p.get('LastId') ?? 0); return all.filter(r => Number(r.ID) > last)
    }
    const db = fakeDb({ gilyonot_nedarim_config: { ...cfg, emailField: '', nameField: '' } })
    const r = await pullNedarimSubscribers(db as never)
    expect(r.ok).toBe(true)
    expect(r.read).toBe(5)
  })

  it('טופס ריק: הודעה ברורה ולא הצלחה שקטה', async () => {
    handler = () => []
    const db = fakeDb({ gilyonot_nedarim_config: { ...cfg, emailField: '', nameField: '' } })
    const r = await pullNedarimSubscribers(db as never)
    expect(r.ok).toBe(false)
    expect(r.error).toBe(EMPTY_FORM_ERROR)
  })
})
