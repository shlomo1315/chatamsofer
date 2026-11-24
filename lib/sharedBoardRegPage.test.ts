import { describe, it, expect } from 'vitest'
import { REG_PAGE_SIZE, parseRegIds, regPages, clampPage, fetchRegDetails, withDetails } from './sharedBoardFetch'
import { regOrder, regTable, type CrRow } from './controlRoom'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const hanging = (_: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
  init?.signal?.addEventListener('abort', () => rej(init.signal!.reason))
})
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// 24.11.2026: טבלת הנרשמים בעמודים — הדף לא מחכה לפרטי המשפחה של כל הנרשמים.
describe('דפדוף בטבלת הנרשמים', () => {
  it('מחשב מספר עמודים ומחזיר עמוד שנשאר בטווח אחרי סינון', () => {
    expect(regPages(0)).toBe(1)
    expect(regPages(REG_PAGE_SIZE)).toBe(1)
    expect(regPages(REG_PAGE_SIZE * 3 + 1)).toBe(4)
    expect(clampPage(10, 120)).toBe(2)
    expect(clampPage(-1, 120)).toBe(0)
    expect(clampPage(3, 0)).toBe(0)
  })

  it('עמוד בגודל קבוע מתוך 6,000 נרשמים, החדש ראשון, וסך הכול מכל השורות', () => {
    const rows: CrRow[] = Array.from({ length: 6000 }, (_, i) => ({
      id: uuid(i), registered_at: new Date(Date.UTC(2026, 10, 1) + i * 60_000).toISOString(), approval_status: 'approved',
      beneficiary: { full_name: `שם ${i}`, city: 'בני ברק', community_affiliation: 'א' },
    }))
    const ordered = regOrder(rows)
    expect(ordered.length).toBe(6000)
    expect(regPages(ordered.length)).toBe(120)
    const p2 = ordered.slice(REG_PAGE_SIZE, REG_PAGE_SIZE * 2)
    expect(p2).toHaveLength(REG_PAGE_SIZE)
    expect(p2[0].id).toBe(uuid(5949))
    // regTable על העמוד שומר את אותו הסדר
    expect(regTable(p2, 500).map(r => r.id)).toEqual(p2.map(r => r.id))
  })

  it('מקבל ב-?ids= רק UUID תקינים, בלי כפילויות ועד גודל עמוד', () => {
    expect(parseRegIds(`${uuid(1)}, ${uuid(1)},abc,1;drop,${uuid(2)}`)).toEqual([uuid(1), uuid(2)])
    expect(parseRegIds(null)).toEqual([])
    expect(parseRegIds(Array.from({ length: 80 }, (_, i) => uuid(i)).join(','))).toHaveLength(REG_PAGE_SIZE)
  })

  it('מבקש את הפרטים של העמוד בבקשה אחת קטנה', async () => {
    const urls: string[] = []
    const r = await fetchRegDetails([uuid(1), uuid(2)], async u => {
      urls.push(u)
      return json({ details: [{ id: uuid(1), beneficiary: { phone: '050' } }] })
    })
    expect(urls).toEqual([`/api/shared/distributions/registrants?ids=${uuid(1)},${uuid(2)}`])
    expect(r).toEqual({ kind: 'ok', details: [{ id: uuid(1), beneficiary: { phone: '050' } }] })
  })

  it('עמוד בלי שורות לא שולח בקשה', async () => {
    let called = false
    expect(await fetchRegDetails([], async () => { called = true; return json({}) })).toEqual({ kind: 'ok', details: [] })
    expect(called).toBe(false)
  })

  it('כשל בעמוד אחד מחזיר שגיאה מקומית (לא זורק ולא נתקע)', async () => {
    const e500 = await fetchRegDetails([uuid(1)], async () => json({ error: 'x' }, 500))
    expect(e500.kind).toBe('error')
    const slow = await fetchRegDetails([uuid(1)], hanging, 30)
    expect(slow.kind).toBe('error')
    if (slow.kind === 'error') expect(slow.message).toContain('לא ענה בזמן')
    const net = await fetchRegDetails([uuid(1)], async () => { throw new TypeError('fail') })
    expect(net.kind).toBe('error')
    expect(await fetchRegDetails([uuid(1)], async () => json({}, 401))).toEqual({ kind: 'locked' })
  })

  it('משלב את הפרטים בשורות הקלות בלי לדרוס קהילה ועיר', () => {
    const rows: CrRow[] = [
      { id: 'a', beneficiary: { full_name: 'כהן', city: 'ירושלים', community_affiliation: 'ק' } },
      { id: 'b', beneficiary: { full_name: 'לוי' } },
    ]
    const m = new Map([['a', { id: 'a', phone: '03', beneficiary: { phone: '050', address: 'רחוב 1', spouse_name: 'שרה' } }]])
    const [a, b] = regTable(withDetails(rows, m), 0)
    expect(a).toMatchObject({ name: 'כהן', phones: '050 · 03', address: 'רחוב 1', spouse: 'שרה', city: 'ירושלים', comm: 'ק' })
    expect(b).toMatchObject({ name: 'לוי', phones: '', address: '' })
  })
})
