import { describe, it, expect, vi, beforeEach } from 'vitest'

// קצב השליחה (הבעלים 18.11: "להשאיר את הקובץ במייל ולהאיץ"): שליחה איטית (PDF כבד) לא מעכבת את הבאות,
// וחריגה מהקצב של Resend (429) נשלחת שוב בלי לספור ניסיון. בלי מיילים אמיתיים: Resend ומסד מדומים.
vi.hoisted(() => { process.env.GILYONOT_RATE_PER_SEC = "10" })

type Row = { id: string; email: string; token: string; attempts: number; status: string; issue_id: string; gilyonot_subscribers: null }
const state = {
  deliveries: [] as Row[],
  rpc: [] as string[],
  sends: [] as { to: string; key?: string }[],
  onSend: null as null | (() => void),
  delayMs: 30,
  limitOnce: new Set<string>(),
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
        await new Promise(r => setTimeout(r, state.delayMs))
        if (state.limitOnce.delete(p.to)) return { data: null, error: { name: 'rate_limit_exceeded', statusCode: 429, message: 'Too many requests' } }
        return { data: { id: 'r-' + p.to }, error: null }
      },
    }
  },
}))

import { runGilyonotSender, resetGilyonotSenderForTest } from './gilyonotSender'

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test'
  resetGilyonotSenderForTest()
  state.rpc = []; state.sends = []; state.onSend = null; state.delayMs = 30; state.limitOnce = new Set()
  state.deliveries = Array.from({ length: 10 }, (_, i) => ({
    id: `d${i}`, email: `u${i}@example.com`, token: `t${i}`, attempts: 0, status: 'pending', issue_id: 'i1', gilyonot_subscribers: null,
  }))
})

describe('קצב שליחת הגיליונות', () => {
  it('שליחה איטית לא מעכבת את הבאות: 10 מיילים של חצי שנייה כל אחד בפחות משתי שניות', async () => {
    state.delayMs = 500
    const t0 = Date.now()
    const res = await runGilyonotSender()
    expect(res).toEqual({ sent: 10, failed: 0 })
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(state.deliveries.every(d => d.status === 'sent')).toBe(true)
  })

  it('חריגה מהקצב של Resend: נשלח שוב באותו מפתח, בלי לספור ניסיון ובלי לעצור את השאר', async () => {
    state.limitOnce.add('u3@example.com')
    const res = await runGilyonotSender()
    expect(res).toEqual({ sent: 10, failed: 0 })
    const tries = state.sends.filter(s => s.to === 'u3@example.com')
    expect(tries.map(s => s.key)).toEqual(['gilyon-d3-0', 'gilyon-d3-0'])
    const d3 = state.deliveries.find(d => d.id === 'd3')!
    expect(d3.status).toBe('sent')
    expect(d3.attempts).toBe(1)
  })

  it('טיק נוסף בזמן שסבב עדיין שולח לא מתחיל סבב שני', async () => {
    state.delayMs = 200
    const first = runGilyonotSender()
    expect(await runGilyonotSender()).toEqual({ sent: 0, failed: 0 })
    expect(await first).toEqual({ sent: 10, failed: 0 })
    expect(state.sends).toHaveLength(10)
  })
})

describe('זיכרון בזמן שליחה', () => {
  it('כמה מיילים בדרך במקביל לפי גודל הקבצים, ולא פחות מ-2', async () => {
    const { inFlightLimit } = await import('./gilyonotSender')
    const MB = 1024 * 1024
    expect(inFlightLimit(1 * MB, 8)).toBe(8)
    expect(inFlightLimit(20 * MB, 8)).toBe(3)
    expect(inFlightLimit(40 * MB, 8)).toBe(2)
  })
})
