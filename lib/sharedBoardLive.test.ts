import { describe, it, expect } from 'vitest'
import { fetchSharedBoard, fetchBoardUpdates, latestRegisteredAt, mergeRecipients } from './sharedBoardFetch'

// 24.11.2026: הדף הציג גלגל עד שכל החלקים נטענו, ורענון אוטומטי טען הכול מחדש.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('fetchSharedBoard — הצגה אחרי החלק הראשון', () => {
  it('onPartial מקבל את הנתונים אחרי כל חלק שיש אחריו עוד, לפני שהטעינה מסתיימת', async () => {
    const partials: number[][] = []
    let n = 0
    const r = await fetchSharedBoard(async () => {
      n++
      if (n === 1) return json({ distributions: [{ id: 'd' }], closesAt: 'x', recipients: [{ id: 1 }], hasMore: true })
      if (n === 2) return json({ recipients: [{ id: 2 }], hasMore: true })
      return json({ recipients: [{ id: 3 }], hasMore: false })
    }, 1000, null, undefined, undefined, d => {
      expect(d.distributions).toEqual([{ id: 'd' }])
      expect(d.closesAt).toBe('x')
      partials.push((d.recipients as { id: number }[]).map(x => x.id))
    })
    expect(partials).toEqual([[1], [1, 2]])
    expect(r.kind === 'ok' && (r.data.recipients as unknown[]).length).toBe(3)
  })

  it('חלק אחד בלבד: אין onPartial (התוצאה הסופית מגיעה מיד)', async () => {
    let calls = 0
    await fetchSharedBoard(async () => json({ recipients: [{ id: 1 }], hasMore: false }), 1000, null, undefined, undefined, () => { calls++ })
    expect(calls).toBe(0)
  })

  it('כשל בחלק מאוחר אחרי שהלוח כבר הוצג מחזיר הודעה (והחלקים הקודמים כבר הגיעו ב-onPartial)', async () => {
    let n = 0
    const partials: number[] = []
    const r = await fetchSharedBoard(async () => (++n === 1 ? json({ recipients: [{ id: 1 }], hasMore: true }) : json({ error: 'x' }, 500)),
      1000, null, undefined, undefined, d => partials.push((d.recipients as unknown[]).length))
    expect(partials).toEqual([1])
    expect(r.kind).toBe('error')
  })
})

describe('fetchBoardUpdates — עדכון חי', () => {
  it('מבקש רק נרשמים מהזמן האחרון ואילך, עם החלוקה שנבחרה', async () => {
    let url = ''
    const r = await fetchBoardUpdates('2026-11-24T18:00:00.000Z', 'a b', async u => { url = u; return json({ recipients: [{ id: 'n' }], hasMore: false }) })
    expect(url).toBe('/api/shared/distributions?after=2026-11-24T18%3A00%3A00.000Z&dist=a%20b')
    expect(r).toEqual({ kind: 'ok', data: { recipients: [{ id: 'n' }], hasMore: false } })
  })

  it('401 מחזיר למסך הסיסמה, ושגיאה מחזירה הודעה', async () => {
    expect(await fetchBoardUpdates('2026-11-24T18:00:00Z', null, async () => json({}, 401))).toEqual({ kind: 'locked' })
    expect((await fetchBoardUpdates('2026-11-24T18:00:00Z', null, async () => json({}, 500))).kind).toBe('error')
  })
})

describe('latestRegisteredAt', () => {
  it('הזמן המאוחר ביותר, לפי זמן ולא לפי סדר השורות, ומתעלם מריקים', () => {
    expect(latestRegisteredAt([
      { registered_at: '2026-11-24T18:00:00+02:00' },
      { registered_at: null },
      { registered_at: '2026-11-24T17:30:00Z' },
      {},
    ])).toBe('2026-11-24T17:30:00Z')
  })
  it('אין נרשמים: null (ואז טעינה מלאה)', () => {
    expect(latestRegisteredAt([])).toBeNull()
  })
})

describe('mergeRecipients', () => {
  it('שורה קיימת מתעדכנת במקומה, חדשה נכנסת בסוף, בלי כפילויות', () => {
    const rows = [{ id: 'a', s: 'pending' }, { id: 'b', s: 'pending' }]
    expect(mergeRecipients(rows, [{ id: 'b', s: 'approved' }, { id: 'c', s: 'pending' }])).toEqual([
      { id: 'a', s: 'pending' }, { id: 'b', s: 'approved' }, { id: 'c', s: 'pending' },
    ])
  })
  it('בלי עדכונים: אותו מערך', () => {
    const rows = [{ id: 'a' }]
    expect(mergeRecipients(rows, [])).toBe(rows)
  })
})
