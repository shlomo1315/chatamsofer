import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// זרימה מלאה של מייל ל-k@: פענוח → ingestKvitel → kvitel_requests + kvitel_request_lines.
// ה-AI כבוי (מחזיר null), כך שנבדק הפענוח לפי תבנית בלבד.
vi.mock('./kvitelAi', () => ({ askClaudeJson: async () => null }))

import { handleKvitelEmail } from './kvitelEmail'

type Row = Record<string, unknown>

// מסד מדומה בזיכרון: רק מה ש-handleKvitelEmail ו-ingestKvitel משתמשים בו.
function fakeDb() {
  const tables: Record<string, Row[]> = {}
  let seq = 0
  const t = (name: string) => (tables[name] ??= [])
  const query = (name: string, opts?: { count?: string; head?: boolean }) => {
    const filters: [string, unknown][] = []
    const rows = () => t(name).filter(r => filters.every(([k, v]) => r[k] === v))
    const q = {
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q },
      neq: () => q, gte: () => q, in: () => q, limit: () => q,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => res(opts?.count ? { count: rows().length, data: null, error: null } : { data: rows(), error: null }),
    }
    return q
  }
  const db = {
    tables,
    from: (name: string) => ({
      select: (_c?: string, opts?: { count?: string; head?: boolean }) => query(name, opts),
      insert: (input: Row | Row[]) => {
        const list = (Array.isArray(input) ? input : [input]).map(r => ({ id: `${name}-${++seq}`, ...r }))
        if (name === 'kvitel_requests' && list.some(r => r.source_ref && t(name).some(x => x.channel === r.channel && x.source_ref === r.source_ref))) {
          const err = { error: { code: '23505', message: 'duplicate' }, data: null }
          return { select: () => ({ single: async () => err }), then: (res: (v: unknown) => unknown) => res(err) }
        }
        t(name).push(...list)
        const ok = { error: null, data: list[0] }
        return { select: () => ({ single: async () => ok }), then: (res: (v: unknown) => unknown) => res({ error: null }) }
      },
      update: (patch: Row) => ({ eq: async (k: string, v: unknown) => { t(name).filter(r => r[k] === v).forEach(r => Object.assign(r, patch)); return { error: null } } }),
      upsert: async (input: Row[]) => { t(name).push(...input); return { error: null } },
      delete: () => ({ eq: async (k: string, v: unknown) => { tables[name] = t(name).filter(r => r[k] !== v); return { error: null } } }),
    }),
  }
  return db as unknown as SupabaseClient & { tables: Record<string, Row[]> }
}

const mail = (o: Partial<{ messageId: string; subject: string; text: string }>) => ({
  messageId: '<m1@mail>', fromEmail: 'Donor@Gmail.com', fromName: 'משפחת כהן', subject: 'שמות לתפילה', text: '', ...o,
})

describe('מייל ל-k@ נקלט כבקשת קוויטל', () => {
  let db: ReturnType<typeof fakeDb>
  beforeEach(() => { db = fakeDb() })

  it('בן: נוצרת בקשה עם השורה ופרטי הבקשה', async () => {
    const r = await handleKvitelEmail(db, mail({ text: 'משה בן יהודית - לרפואה שלימה' }))
    expect(r.ok).toBe(true)
    expect(r.requestId).toBeTruthy()
    const [req] = db.tables.kvitel_requests
    expect(req).toMatchObject({ channel: 'email', source_ref: '<m1@mail>', contact_email: 'donor@gmail.com', contact_name: 'משפחת כהן' })
    expect(String(req.raw_text)).toContain('משה בן יהודית')
    expect(db.tables.kvitel_request_lines.map(l => [l.request_id, l.name, l.relation, l.parent_name, l.request_type]))
      .toEqual([[req.id, 'משה', 'ben', 'יהודית', 'refua']])
  })

  it('בת', async () => {
    await handleKvitelEmail(db, mail({ text: 'שרה בת רחל לזיווג הגון' }))
    expect(db.tables.kvitel_request_lines.map(l => [l.name, l.relation, l.parent_name, l.request_type]))
      .toEqual([['שרה', 'bat', 'רחל', 'zivug']])
  })

  it('כמה שמות במייל אחד: בקשה אחת עם כל השורות', async () => {
    await handleKvitelEmail(db, mail({
      subject: 'לרפואה שלימה',
      text: 'שלום רב,\nמשה בן יהודית\nשרה בת רחל - פרנסה\nיעקב בן לאה, דוד בן מרים\nתודה רבה',
    }))
    expect(db.tables.kvitel_requests).toHaveLength(1)
    expect(db.tables.kvitel_request_lines.map(l => [l.name, l.relation, l.parent_name, l.request_type])).toEqual([
      ['משה', 'ben', 'יהודית', 'refua'],
      ['שרה', 'bat', 'רחל', 'parnasa'],
      ['יעקב', 'ben', 'לאה', 'refua'],
      ['דוד', 'ben', 'מרים', 'refua'],
    ])
  })

  it('מייל בלי פורמט "X בן/בת Y": לא נוצרת בקשה', async () => {
    const r = await handleKvitelEmail(db, mail({ subject: 'שאלה', text: 'שלום, מתי נוסעים לציון? תודה' }))
    expect(r).toEqual({ ok: true, skipped: 'no-names' })
    expect(db.tables.kvitel_requests ?? []).toHaveLength(0)
  })

  it('מייל כפול (אותו message-id שוב): לא נוצרת בקשה שנייה', async () => {
    const m = mail({ text: 'משה בן יהודית - לרפואה' })
    const first = await handleKvitelEmail(db, m)
    const second = await handleKvitelEmail(db, m)
    expect(first.requestId).toBeTruthy()
    expect(second).toEqual({ ok: true, duplicate: true })
    expect(db.tables.kvitel_requests).toHaveLength(1)
    expect(db.tables.kvitel_request_lines).toHaveLength(1)
  })

  it('שני מיילים שונים: שתי בקשות נפרדות', async () => {
    await handleKvitelEmail(db, mail({ messageId: '<a@x>', text: 'משה בן יהודית' }))
    await handleKvitelEmail(db, mail({ messageId: '<b@x>', text: 'שרה בת רחל' }))
    expect(db.tables.kvitel_requests).toHaveLength(2)
  })
})
