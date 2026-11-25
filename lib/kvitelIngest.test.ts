import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/kvitelReview', () => ({
  loadReviewContext: async () => ({ pendingKeys: new Set<string>() }),
  dropDuplicateLines: (lines: unknown[]) => ({ kept: lines, keptIndexes: lines.map((_, i) => i), dropped: 0 }),
  aiNoteFlags: async (lines: unknown[]) => lines.map(() => null),
  reviewLines: (lines: unknown[]) => lines.map(() => null),
}))

import { reprocessKvitelRequest } from './kvitelIngest'

// מסד מדומה שרושם מה נמחק, מה נוסף ומה עודכן
function fakeDb(status: string) {
  const log = { deleted: false, inserted: [] as Record<string, unknown>[], patch: null as Record<string, unknown> | null }
  const db = {
    from: (t: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: t === 'kvitel_requests' ? { id: 'r1', status } : null }) }) }),
      delete: () => ({ eq: async () => { log.deleted = true; return { error: null } } }),
      insert: async (rows: Record<string, unknown>[]) => { log.inserted.push(...rows); return { error: null } },
      update: (p: Record<string, unknown>) => ({ eq: async () => { log.patch = p; return { error: null } } }),
    }),
  }
  return { db: db as unknown as SupabaseClient, log }
}

const line = (name: string) => ({ name, relation: 'ben' as const, parentName: 'שרה', requestType: 'refua' })

describe('reprocessKvitelRequest: השלמת שמות שחסרו', () => {
  it('מוסיף אחרי השורות הקיימות בלי למחוק אותן, והבקשה נשארת ממתינה', async () => {
    const { db, log } = fakeDb('pending')
    const r = await reprocessKvitelRequest(db, 'r1', { channel: 'nedarim', lines: [line('משה'), line('יוסף')] }, { appendAfter: 1 })
    expect(r).toEqual({ ok: true, status: 'pending', lines: 2 })
    expect(log.deleted).toBe(false)
    expect(log.inserted.map(x => x.position)).toEqual([1, 2])
    expect(log.patch).toMatchObject({ status: 'pending' })
  })

  it('בקשה שכבר נשלחה לא משתנה', async () => {
    const { db, log } = fakeDb('done')
    const r = await reprocessKvitelRequest(db, 'r1', { channel: 'nedarim', lines: [line('משה')] }, { appendAfter: 1 })
    expect(r.ok).toBe(false)
    expect(log.inserted).toEqual([])
  })
})
