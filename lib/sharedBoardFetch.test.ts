import { describe, it, expect } from 'vitest'
import { fetchSharedBoard, postSharedPassword, boardRecipientDistIds, sharedLoadingText, type BoardProgress } from './sharedBoardFetch'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// בקשה שלא עונה עד שמגבלת הזמן מבטלת אותה (כמו בקשה שנתקעה בסינון)
const hanging = (_: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
  init?.signal?.addEventListener('abort', () => rej(init.signal!.reason))
})

describe('fetchSharedBoard', () => {
  it('מחזיר נתונים כשהשרת עונה', async () => {
    const r = await fetchSharedBoard(async () => json({ distributions: [] }))
    expect(r).toEqual({ kind: 'ok', data: { distributions: [], recipients: [] } })
  })

  // 24.11.2026: תשובה אחת עם כל הנרשמים לא עברה בזמן בטלפון — עכשיו חלק-אחר-חלק
  it('טוען את הנרשמים בחלקים עד שהשרת מסמן שאין עוד', async () => {
    const urls: string[] = []
    const r = await fetchSharedBoard(async u => {
      urls.push(u)
      if (urls.length === 1) return json({ distributions: [{ id: 'd' }], closesAt: 'x', recipients: [{ id: 1 }, { id: 2 }], hasMore: true })
      if (urls.length === 2) return json({ recipients: [{ id: 2 }, { id: 3 }], hasMore: true })
      return json({ recipients: [{ id: 4 }], hasMore: false })
    }, 1000, 'live')
    expect(urls).toEqual([
      '/api/shared/distributions?dist=live',
      '/api/shared/distributions?part=1&dist=live',
      '/api/shared/distributions?part=2&dist=live',
    ])
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      // ההגדרות מהחלק הראשון נשמרות, ונרשם שהופיע בשני חלקים נספר פעם אחת
      expect(r.data.closesAt).toBe('x')
      expect(r.data.distributions).toEqual([{ id: 'd' }])
      expect((r.data.recipients as { id: number }[]).map(x => x.id)).toEqual([1, 2, 3, 4])
    }
  })

  it('כל חלק מקבל מגבלת זמן משלו, וכשל באמצע מציג מה נטען וכמה זמן לקח', async () => {
    let n = 0
    const r = await fetchSharedBoard(async (u, init) => {
      n++
      if (n === 1) return json({ recipients: [{ id: 1 }], hasMore: true, serverMs: 1500 })
      return hanging(u, init)
    }, 30)
    expect(r.kind).toBe('error')
    if (r.kind === 'error') {
      expect(r.message).toContain('לא ענה בזמן')
      expect(r.message).toContain('נכשל חלק 2, אחרי 1 נרשמים')
      expect(r.message).toContain("שרת 1.5 ש'")
    }
  })

  // 24.11.2026: בטלפון נשאר רק גלגל — לכל חלק הייתה מגבלה, אבל לא לטעינה כולה
  it('מגבלה כוללת: חלקים איטיים שכל אחד בתוך המגבלה שלו עוצרים בהודעה עם מה שנטען', async () => {
    let n = 0
    const r = await fetchSharedBoard(async () => {
      n++
      await new Promise(res => setTimeout(res, 20))
      return json({ recipients: [{ id: n }], hasMore: true })
    }, 1000, null, undefined, 70)
    expect(r.kind).toBe('error')
    if (r.kind === 'error') {
      expect(r.message).toMatch(/לא הסתיימה|לא ענה בזמן/)
      expect(r.message).toMatch(/נרשמים/)
    }
    expect(n).toBeLessThan(6)
  })

  it('בקשה שמתעלמת מהביטול עדיין מסתיימת (לא נשאר גלגל לנצח)', async () => {
    const r = await fetchSharedBoard(() => new Promise<Response>(() => {}), 30)
    expect(r).toEqual({ kind: 'error', message: expect.stringContaining('לא ענה בזמן') })
  })

  it('גוף שלא מגיע ומתעלם מהביטול עדיין מסתיים', async () => {
    const r = await fetchSharedBoard(async () => new Response(new ReadableStream({ start() {} }), { status: 200 }), 30)
    expect(r).toEqual({ kind: 'error', message: expect.stringContaining('לא ענה בזמן') })
  })

  it('מדווח התקדמות לפני כל חלק', async () => {
    const seen: BoardProgress[] = []
    let n = 0
    await fetchSharedBoard(async () => (++n === 1
      ? json({ recipients: [{ id: 1 }, { id: 2 }], hasMore: true })
      : json({ recipients: [{ id: 3 }], hasMore: false })), 1000, null, p => seen.push(p))
    expect(seen).toEqual([{ part: 1, loaded: 0 }, { part: 2, loaded: 2 }])
    expect(sharedLoadingText(seen[1])).toBe('נטענו 2 נרשמים · טוען חלק 2…')
  })

  it('401 בחלק המשך מחזיר למסך הסיסמה', async () => {
    let n = 0
    const r = await fetchSharedBoard(async () => (++n === 1 ? json({ recipients: [], hasMore: true }) : json({}, 401)))
    expect(r).toEqual({ kind: 'locked' })
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

  it('דף HTML במקום JSON (חסימת סינון) מחזיר הודעה עם הקוד ותחילת הגוף', async () => {
    const r = await fetchSharedBoard(async () => new Response('<html>\n  blocked by filter</html>', { status: 200 }))
    expect(r.kind).toBe('error')
    if (r.kind === 'error') {
      expect(r.message).toContain('לא תקינה')
      expect(r.message).toContain('קוד 200')
      expect(r.message).toContain('<html> blocked by filter</html>')
    }
  })

  it('שגיאת שרת מציגה את תחילת הגוף', async () => {
    const r = await fetchSharedBoard(async () => new Response('<h1>502 Bad Gateway</h1>', { status: 502 }))
    expect(r).toEqual({ kind: 'error', message: expect.stringContaining('502 Bad Gateway') })
  })

  // 24.11.2026: כותרות הגיעו, אבל הורדת הגוף הענק נקטעה במגבלת הזמן — הוצג בטעות "לא תקינה"
  it('הורדת גוף שנקטעה במגבלת הזמן היא "לא ענה בזמן" ולא "לא תקינה"', async () => {
    const r = await fetchSharedBoard(async (_u, init) => new Response(new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"recipients":['))
        init?.signal?.addEventListener('abort', () => c.error(init.signal!.reason))
      },
    }), { status: 200 }), 30)
    expect(r).toEqual({ kind: 'error', message: expect.stringContaining('לא ענה בזמן') })
  })

  it('מבקש חלוקה קודמת שנבחרה', async () => {
    let url = ''
    await fetchSharedBoard(async u => { url = u; return json({}) }, 1000, 'a b')
    expect(url).toBe('/api/shared/distributions?dist=a%20b')
  })
})

describe('boardRecipientDistIds', () => {
  const dists = [{ id: 'new' }, { id: 'mid' }, { id: 'old' }]
  it('ברירת מחדל: רק החלוקה החיה — לא כל החלוקות', () => {
    expect(boardRecipientDistIds(dists, 'mid', null)).toEqual(['mid'])
  })
  it('בלי חלוקה חיה: העדכנית ביותר', () => {
    expect(boardRecipientDistIds(dists, null, null)).toEqual(['new'])
  })
  it('חלוקה קודמת שנבחרה מתווספת', () => {
    expect(boardRecipientDistIds(dists, 'new', 'old')).toEqual(['new', 'old'])
  })
  it('מזהה לא מוכר נדחה', () => {
    expect(boardRecipientDistIds(dists, 'new', 'zzz')).toEqual(['new'])
  })
  it('אין חלוקות', () => {
    expect(boardRecipientDistIds([], null, 'x')).toEqual([])
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
