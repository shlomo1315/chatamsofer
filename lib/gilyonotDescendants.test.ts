import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { addDescendantToMailing, syncAllDescendantsToMailing } from './gilyonotDescendants'

type Row = Record<string, unknown>

function fakeDb(subs: Row[], bens: Row[] = []) {
  const tables: Record<string, Row[]> = { gilyonot_subscribers: subs, beneficiaries: bens }
  return {
    from(name: string) {
      const rows = tables[name]
      const filters: ((r: Row) => boolean)[] = []
      const q = {
        select() { return q },
        not(k: string) { filters.push(r => r[k] != null); return q },
        order() { return q },
        range: async (a: number, b: number) => ({ data: rows.filter(r => filters.every(f => f(r))).slice(a, b + 1), error: null }),
        eq(k: string, v: unknown) { filters.push(r => r[k] === v); return q },
        maybeSingle: async () => ({ data: rows.filter(r => filters.every(f => f(r)))[0] ?? null, error: null }),
        insert: async (row: Row) => {
          if (rows.some(r => r.email === row.email)) return { error: { code: '23505', message: 'dup' } }
          rows.push({ id: String(rows.length + 1), status: 'active', ...row })
          return { error: null }
        },
        update(patch: Row) { return { eq: async (_k: string, v: unknown) => { rows.filter(r => r.id === v).forEach(r => Object.assign(r, patch)); return { error: null } } } },
      }
      return q
    },
  } as unknown as SupabaseClient
}

describe('צאצאים לרשימת הדיוור', () => {
  it('נרשם חדש נכנס מיד, בלי כפילות בהרשמה חוזרת', async () => {
    const subs: Row[] = []
    const db = fakeDb(subs)
    await addDescendantToMailing(db, { id: 'b1', email: ' Moshe@Example.com ', full_name: 'משה כהן' })
    await addDescendantToMailing(db, { id: 'b1', email: 'moshe@example.com', full_name: 'משה כהן' })
    expect(subs).toHaveLength(1)
    expect(subs[0]).toMatchObject({ email: 'moshe@example.com', source: 'descendants', status: 'active' })
  })

  it('מייל לא תקין או חסר לא נכנס', async () => {
    const subs: Row[] = []
    await addDescendantToMailing(fakeDb(subs), { email: 'לא-מייל' })
    await addDescendantToMailing(fakeDb(subs), { email: null })
    expect(subs).toHaveLength(0)
  })

  it('קיימים: סנכרון מוסיף את כולם, ולא מחזיר מי שהסיר את עצמו', async () => {
    const subs: Row[] = [{ id: 's1', email: 'gone@example.com', status: 'unsubscribed', full_name: null }]
    const bens: Row[] = [
      { id: 'b1', email: 'a@example.com', full_name: 'א' },
      { id: 'b2', email: 'gone@example.com', full_name: 'ב' },
      { id: 'b3', email: 'bad', full_name: 'ג' },
      { id: 'b4', email: 'a@example.com', full_name: 'כפול' },
    ]
    const r = await syncAllDescendantsToMailing(fakeDb(subs, bens))
    expect(r.added).toBe(1)
    expect(subs.map(s => s.email).sort()).toEqual(['a@example.com', 'gone@example.com'])
    expect(subs.find(s => s.email === 'gone@example.com')!.status).toBe('unsubscribed')
  })
})
