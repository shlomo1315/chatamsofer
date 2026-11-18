import { describe, it, expect, vi, beforeEach } from 'vitest'

// כיבוי מסודר בפריסה: SIGTERM באמצע סבב. הזוג שבשליחה מסתיים ומסומן,
// הנעילה משתחררת, ואין שליחה נוספת. בלי מיילים אמיתיים: Resend ומסד מדומים.

type Row = { id: string; email: string; token: string; attempts: number; status: string; issue_id: string; gilyonot_subscribers: null }
const state = {
  deliveries: [] as Row[],
  rpc: [] as string[],
  sends: [] as { to: string; key?: string }[],
  onSend: null as null | (() => void),
}

function builder(table: string) {
  const f: Record<string, unknown> = {}
  let op = 'select'
  let patch: Record<string, unknown> = {}
  const q: Record<string, unknown> = {
    select: () => q, order: () => q, limit: () => q, lte: () => q, in: () => q,
    eq: (k: string, v: unknown) => { f[k] = v; return q },
    update: (p: Record<string, unknown>) => { op = 'update'; patch = p; return q },
    delete: () => { op = 'delete'; return q },
    then: (res: (v: unknown) => void) => res(run()),
  }
  function run() {
    if (table === 'gilyonot_deliveries') {
      if (op === 'update') { const r = state.deliveries.find(d => d.id === f.id); if (r) Object.assign(r, patch); return { error: null } }
      return { data: state.deliveries.filter(d => d.status === f.status).map(d => ({ ...d })), error: null }
    }
    if (table === 'gilyonot_issues' && op === 'select') {
      return { data: f.status === 'sending' ? [{ id: 'i1', status: 'sending', subject: 'גיליון', parasha: 'ויצא', title: 'גיליון', file_path: 'a.pdf', body_html: '<p>שלום</p>' }] : [], error: null }
    }
    return { data: [], error: null }
  }
  return q
}

const db = {
  from: (t: string) => builder(t),
  rpc: async (name: string) => { state.rpc.push(name); return { data: true, error: null } },
  storage: { from: () => ({ download: async () => ({ data: new Blob(['%PDF']), error: null }) }) },
}

vi.mock('./apiAuth', () => ({ getServiceClient: () => db }))
vi.mock('./jewishCalendar', () => ({ isBlockedForMail: () => false }))
vi.mock('./gilyonotHeichalot', () => ({ heichalotMissingError: () => null, advanceIssueCounter: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (p: { to: string }, o?: { idempotencyKey?: string }) => {
        state.sends.push({ to: p.to, key: o?.idempotencyKey })
        state.onSend?.()
        await new Promise(r => setTimeout(r, 30))
        return { data: { id: 'r-' + p.to }, error: null }
      },
    }
  },
}))

import { runGilyonotSender, stopGilyonotSender, resetGilyonotSenderForTest } from './gilyonotSender'

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test'
  resetGilyonotSenderForTest()
  state.rpc = []; state.sends = []; state.onSend = null
  state.deliveries = Array.from({ length: 10 }, (_, i) => ({
    id: `d${i}`, email: `u${i}@example.com`, token: `t${i}`, attempts: 0, status: 'pending', issue_id: 'i1', gilyonot_subscribers: null,
  }))
})

describe('כיבוי מסודר של שליחת הגיליונות', () => {
  it('SIGTERM באמצע סבב: הזוג שבשליחה מסומן, הנעילה משתחררת ולא נשלח עוד', async () => {
    let stopped: Promise<void> | null = null
    state.onSend = () => { if (!stopped) stopped = stopGilyonotSender() }

    const res = await runGilyonotSender()
    await stopped

    expect(res).toEqual({ sent: 2, failed: 0 })
    expect(state.sends).toHaveLength(2)
    expect(state.deliveries.filter(d => d.status === 'sent').map(d => d.id)).toEqual(['d0', 'd1'])
    expect(state.deliveries.filter(d => d.status === 'pending')).toHaveLength(8)
    expect(state.rpc).toContain('release_worker_lock')

    // טיק נוסף באותו תהליך אחרי SIGTERM לא שולח כלום
    expect(await runGilyonotSender()).toEqual({ sent: 0, failed: 0 })
    expect(state.sends).toHaveLength(2)
  })

  it('השרת החדש ממשיך מהנמען הבא, בלי שליחה כפולה', async () => {
    let stopped: Promise<void> | null = null
    state.onSend = () => { if (!stopped) stopped = stopGilyonotSender() }
    await runGilyonotSender()
    await stopped

    resetGilyonotSenderForTest() // תהליך חדש
    state.onSend = null
    vi.useFakeTimers({ toFake: ['Date'] })
    let n = 0
    state.onSend = () => { if (++n === 4) vi.setSystemTime(Date.now() + 60_000) }
    await runGilyonotSender()
    vi.useRealTimers()

    const to = state.sends.map(s => s.to)
    expect(new Set(to).size).toBe(to.length)
    expect(to.slice(0, 4)).toEqual(['u0@example.com', 'u1@example.com', 'u2@example.com', 'u3@example.com'])
  })

  it('כל שליחה נושאת מפתח idempotency קבוע לנמען ולניסיון', async () => {
    state.onSend = () => { void stopGilyonotSender() }
    await runGilyonotSender()
    expect(state.sends.map(s => s.key)).toEqual(['gilyon-d0-0', 'gilyon-d1-0'])
  })
})
