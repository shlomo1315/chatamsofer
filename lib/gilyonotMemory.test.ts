import { describe, it, expect, vi, beforeEach } from 'vitest'

// זיכרון בשליחה (18.11: השרת קרס מ-OOM אחרי #689): Resend מריץ JSON.stringify על הבקשה,
// ו-Buffer הופך למערך של מספר לכל בית. לכן הקובץ עובר כמחרוזת base64 שמוכנה פעם אחת,
// ומספר המיילים שבדרך במקביל מוגבל לפי גודל הקובץ.
vi.hoisted(() => { process.env.GILYONOT_RATE_PER_SEC = "10" })

type Row = { id: string; email: string; token: string; attempts: number; status: string; issue_id: string; gilyonot_subscribers: null }
const state = {
  deliveries: [] as Row[],
  fileBytes: 4,
  contentTypes: [] as string[],
  bodyBytes: [] as number[],
  live: 0,
  maxLive: 0,
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
  rpc: async () => ({ data: true, error: null }),
  storage: { from: () => ({ download: async () => ({ data: new Blob([new Uint8Array(state.fileBytes)]), error: null }) }) },
}

vi.mock('./apiAuth', () => ({ getServiceClient: () => db }))
vi.mock('./jewishCalendar', () => ({ isBlockedForMail: () => false }))
vi.mock('./gilyonotHeichalot', () => ({ heichalotMissingError: () => null, advanceIssueCounter: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (p: { to: string; attachments?: { content: unknown }[] }) => {
        state.live++; state.maxLive = Math.max(state.maxLive, state.live)
        for (const a of p.attachments ?? []) state.contentTypes.push(typeof a.content)
        state.bodyBytes.push(JSON.stringify(p).length) // מה ש-Resend באמת שולח
        await new Promise(r => setTimeout(r, 50))
        state.live--
        return { data: { id: 'r-' + p.to }, error: null }
      },
    }
  },
}))

import { runGilyonotSender, resetGilyonotSenderForTest } from './gilyonotSender'

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test'
  resetGilyonotSenderForTest()
  state.contentTypes = []; state.bodyBytes = []; state.live = 0; state.maxLive = 0; state.fileBytes = 4
  state.deliveries = Array.from({ length: 20 }, (_, i) => ({
    id: `d${i}`, email: `u${i}@example.com`, token: `t${i}`, attempts: 0, status: 'pending', issue_id: 'i1', gilyonot_subscribers: null,
  }))
})

describe('זיכרון בשליחת הגיליונות', () => {
  it('הקובץ עובר ל-Resend כמחרוזת base64, כך שגוף הבקשה בגודל הקובץ ולא פי כמה', async () => {
    state.fileBytes = 1024 * 1024
    expect(await runGilyonotSender()).toEqual({ sent: 20, failed: 0 })
    expect(new Set(state.contentTypes)).toEqual(new Set(['string']))
    // base64 של 1MB הוא כ-1.4MB; Buffer היה הופך ל-[0,0,0,...] של יותר מ-2MB
    expect(Math.max(...state.bodyBytes)).toBeLessThan(1.5 * 1024 * 1024)
  })

  it('קובץ כבד מוריד את מספר המיילים במקביל, וכולם עדיין נשלחים', async () => {
    state.fileBytes = 25 * 1024 * 1024
    expect(await runGilyonotSender()).toEqual({ sent: 20, failed: 0 })
    expect(state.maxLive).toBeLessThanOrEqual(3)
  }, 30_000)

  it('קובץ קטן: שולחים במקביל כרגיל', async () => {
    expect(await runGilyonotSender()).toEqual({ sent: 20, failed: 0 })
    expect(state.maxLive).toBeGreaterThan(3)
  })
})
