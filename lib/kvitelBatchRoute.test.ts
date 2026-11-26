import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { KvitelRequestRow } from './kvitelQuery'

// מסד דמה בזיכרון: סטטוס הבקשות והמנות שנרשמו, בלי נתונים חיים.
// loadKvitelRequests מחזיר תמונת מצב שנלקחה לפני הסימון — כמו שתי סגירות שרצות במקביל.
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let status: Map<string, string>
let batches: { parsha: string; request_ids: string[] }[]
let snapshot: KvitelRequestRow[]
let parsha: string
let insertFails = false

vi.mock('@/lib/apiAuth', async () => {
  const { NextResponse } = await import('next/server')
  const requests = {
    update: (patch: { status: string }) => {
      let ids: string[] = []
      const q = {
        in: (_: string, v: string[]) => { ids = v; return q },
        eq: (col: string, val: string) => {
          if (col === 'status') ids = ids.filter(id => status.get(id) === val)
          return q
        },
        select: async () => {
          ids.forEach(id => status.set(id, patch.status))
          return { data: ids.map(id => ({ id })), error: null }
        },
        then: (ok: (v: { error: null }) => void) => { ids.forEach(id => status.set(id, patch.status)); ok({ error: null }) },
      }
      return q
    },
  }
  const batchTable = {
    insert: (rec: { parsha: string; request_ids: string[] }) => ({
      select: () => ({
        single: async () => {
          if (insertFails) return { data: null, error: { code: 'XX000' } }
          batches.push(rec)
          return { data: { id: `b${batches.length}` }, error: null }
        },
      }),
    }),
  }
  return {
    requirePermission: async () => ({ userId: 'u1', email: 'staff@example.com' }),
    forbidden: () => NextResponse.json({ error: 'אין הרשאה' }, { status: 403 }),
    serverMisconfigured: () => NextResponse.json({ error: 'x' }, { status: 500 }),
    getServiceClient: () => ({ from: (t: string) => (t === 'kvitel_batches' ? batchTable : requests) }),
  }
})
vi.mock('@/lib/activityLog', () => ({ logActivity: async () => {} }))
vi.mock('@/lib/kvitelOpenWeek', () => ({ loadOpenKvitelWeek: async () => ({ parsha }) }))
vi.mock('@/lib/kvitelQuery', async orig => ({
  ...(await orig<typeof import('./kvitelQuery')>()),
  loadKvitelRequests: async () => ({ rows: snapshot, error: null }),
}))

import { POST } from '@/app/api/admin/kvitel/batches/route'

const row = (id: string): KvitelRequestRow => ({
  id, channel: 'nedarim', status: 'pending', contact_name: 'משה', contact_phone: null, contact_email: null,
  raw_text: null, recording_url: null, note: null, submitted_at: '2026-11-25T08:00:00Z', done_at: null,
  kvitel_request_lines: [{ id: `l${id}`, position: 0, name: 'מאיר', relation: 'ben', parent_name: 'רחל', request_type: 'refua', request_note: null, flagged: false, flag_reason: null }],
})
const ids = [UUID(1), UUID(2), UUID(3)]
const close = () => POST({ json: async () => ({ ids }) } as never)

beforeEach(() => {
  status = new Map(ids.map(id => [id, 'pending']))
  batches = []
  snapshot = ids.map(row)
  parsha = 'וישלח'
  insertFails = false
})

describe('סגירת מנה (POST /api/admin/kvitel/batches)', () => {
  it('אישור חוזר על אותן בקשות לא רושם מנה שנייה (26.11.2026: וישלח וגם וישב)', async () => {
    const first = await close()
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ ok: true, updated: 3, recorded: true })
    // הבקשה השנייה ראתה את הבקשות עוד כ"לא נשלח", והשבוע הפתוח כבר התקדם
    parsha = 'וישב'
    const second = await close()
    expect(second.status).toBe(409)
    expect(batches).toEqual([expect.objectContaining({ parsha: 'וישלח', request_ids: ids })])
    expect([...status.values()]).toEqual(['done', 'done', 'done'])
  })

  it('רישום המנה נכשל: הבקשות חוזרות ל"לא נשלח" ואפשר לאשר שוב', async () => {
    insertFails = true
    expect((await close()).status).toBe(500)
    expect([...status.values()]).toEqual(['pending', 'pending', 'pending'])
    insertFails = false
    expect((await close()).status).toBe(200)
    expect(batches).toHaveLength(1)
  })
})
