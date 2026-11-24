import { describe, it, expect } from 'vitest'
import { fetchSharedBoard, postSharedPassword } from './sharedBoardFetch'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// בקשה שלא עונה עד שמגבלת הזמן מבטלת אותה (כמו בקשה שנתקעה בסינון)
const hanging = (_: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
  init?.signal?.addEventListener('abort', () => rej(init.signal!.reason))
})

describe('fetchSharedBoard', () => {
  it('מחזיר נתונים כשהשרת עונה', async () => {
    const r = await fetchSharedBoard(async () => json({ distributions: [] }))
    expect(r).toEqual({ kind: 'ok', data: { distributions: [] } })
  })

  it('401 מחזיר למסך הסיסמה', async () => {
    expect(await fetchSharedBoard(async () => json({ error: 'x' }, 401))).toEqual({ kind: 'locked' })
  })

  it('שגיאת שרת מחזירה הודעה ולא נשארת בטעינה', async () => {
    const r = await fetchSharedBoard(async () => json({ error: 'boom' }, 500))
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toContain('500')
  })

  it('בקשה שנתקעה מסתיימת בהודעת שגיאה אחרי מגבלת הזמן', async () => {
    const r = await fetchSharedBoard(hanging, 30)
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toContain('לא ענה בזמן')
  })

  it('ניתוק רשת מחזיר הודעת חיבור', async () => {
    const r = await fetchSharedBoard(async () => { throw new TypeError('Failed to fetch') })
    expect(r).toEqual({ kind: 'error', message: expect.stringContaining('אין חיבור') })
  })

  it('דף HTML במקום JSON (חסימת סינון) מחזיר הודעה', async () => {
    const r = await fetchSharedBoard(async () => new Response('<html>blocked</html>', { status: 200 }))
    expect(r).toEqual({ kind: 'error', message: expect.stringContaining('לא תקינה') })
  })
})

describe('postSharedPassword', () => {
  it('סיסמה נכונה', async () => {
    expect(await postSharedPassword('p', async () => json({ ok: true }))).toEqual({ ok: true })
  })

  it('סיסמה שגויה מחזירה את הודעת השרת', async () => {
    const r = await postSharedPassword('p', async () => json({ error: 'סיסמה שגויה. נותרו 2 ניסיונות.' }, 401))
    expect(r).toEqual({ ok: false, blocked: false, message: 'סיסמה שגויה. נותרו 2 ניסיונות.' })
  })

  it('נעילת IP מסומנת כחסימה', async () => {
    const r = await postSharedPassword('p', async () => json({ error: 'הכניסה חסומה, נסה שוב בעוד 3 שעות.' }, 429))
    expect(r).toEqual({ ok: false, blocked: true, message: 'הכניסה חסומה, נסה שוב בעוד 3 שעות.' })
  })

  it('כניסה שנתקעה לא משאירה את הכפתור מסתובב לנצח', async () => {
    const r = await postSharedPassword('p', hanging, 30)
    expect(r).toEqual({ ok: false, blocked: false, message: expect.stringContaining('לא ענה בזמן') })
  })

  it('שגיאת שרת בלי JSON', async () => {
    const r = await postSharedPassword('p', async () => new Response('bad gateway', { status: 502 }))
    expect(r).toEqual({ ok: false, blocked: false, message: expect.stringContaining('502') })
  })
})
