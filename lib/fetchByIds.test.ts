import { describe, it, expect } from 'vitest'
import { fetchByIds } from './fetchByIds'

const ids = Array.from({ length: 250 }, (_, i) => `id${i}`)

describe('fetchByIds', () => {
  it('מפצל לקבוצות ומאחד תוצאות', async () => {
    const sizes: number[] = []
    const { rows, error } = await fetchByIds<string>(ids, async c => {
      sizes.push(c.length)
      return { data: c, error: null }
    }, 100)
    expect(sizes).toEqual([100, 100, 50])
    expect(rows).toHaveLength(250)
    expect(error).toBeNull()
  })
  it('מחזיר שגיאה כשקבוצה נכשלת (כולל חריגת רשת)', async () => {
    const { error } = await fetchByIds<string>(ids, async c => {
      if (c[0] === 'id100') throw new TypeError('fetch failed')
      return { data: c, error: null }
    }, 100)
    expect(error).toBe('fetch failed')
  })
  it('רשימה ריקה', async () => {
    const r = await fetchByIds<string>([], async () => ({ data: [], error: null }))
    expect(r).toEqual({ rows: [], error: null })
  })
})
