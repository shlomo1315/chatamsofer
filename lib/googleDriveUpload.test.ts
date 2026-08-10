// בדיקות להעלאה ה-resumable ל-Drive — מול שרת מדומה שמדבר את הפרוטוקול
// האמיתי של גוגל (308 + Range, שאילתת מצב עם "bytes *\/total").
//
// זו הלוגיקה שהחליפה את multipart שנכשל ב-EPROTO על גיבוי של מאות MB.
// מה שחשוב לוודא כאן: שהבייטים שמגיעים לצד השני זהים למקור, ושכשל באמצע
// ממשיך מהנקודה הנכונה במקום להתחיל מחדש או לדלג על מנה.
import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'http'
import { AddressInfo } from 'net'
import { uploadToSession } from './googleDrive'

const CHUNK = 8 * 1024 * 1024

type Opts = {
  // מספר המנה (0-based) שתיכשל, ואיך: ניתוק חיבור או שגיאת 5xx
  failAt?: number
  failMode?: 'reset' | 'server-error'
  // כמה בייטים מהמנה הכושלת בכל זאת נקלטו בצד השני (סימולציה לתשובה שאבדה)
  swallowBytes?: number
}

// שרת שמצטבר את מה שהתקבל, בדיוק כמו סשן resumable אמיתי.
function mockDrive(opts: Opts = {}) {
  const received: Buffer[] = []
  let got = 0
  let chunkIndex = 0
  let failed = false
  const ranges: string[] = []

  const server = createServer((req, res) => {
    const contentRange = req.headers['content-range'] as string
    ranges.push(contentRange)

    // שאילתת מצב: "bytes *\/total" — בלי גוף
    if (/^bytes \*\//.test(contentRange)) {
      req.resume()
      if (got === 0) { res.writeHead(308).end(); return }
      res.writeHead(308, { Range: `bytes=0-${got - 1}` }).end()
      return
    }

    const total = Number(contentRange.split('/')[1])
    const body: Buffer[] = []
    req.on('data', c => body.push(c))
    req.on('end', () => {
      const idx = chunkIndex++
      const buf = Buffer.concat(body)

      if (!failed && opts.failAt === idx) {
        failed = true
        if (opts.swallowBytes) { received.push(buf.subarray(0, opts.swallowBytes)); got += opts.swallowBytes }
        if (opts.failMode === 'server-error') { res.writeHead(503).end('slow down'); return }
        res.destroy() // ניתוק גס — מה ש-EPROTO/ECONNRESET נראה כמוהו
        return
      }

      received.push(buf)
      got += buf.length
      if (got >= total) { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: 'file-123' })); return }
      res.writeHead(308, { Range: `bytes=0-${got - 1}` }).end()
    })
  })

  return { server, received: () => Buffer.concat(received), ranges }
}

let active: Server | null = null
afterEach(() => { active?.close(); active = null })

async function listen(server: Server): Promise<string> {
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  active = server
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/session`
}

describe('uploadToSession — העלאה במנות', () => {
  it('מעלה קובץ קטן ממנה אחת ומחזיר את מזהה הקובץ', async () => {
    const data = Buffer.from('גיבוי קטן'.repeat(100), 'utf8')
    const mock = mockDrive()
    const url = await listen(mock.server)

    const res = await uploadToSession(url, data, 0)

    expect(res.ok).toBe(true)
    expect(res.id).toBe('file-123')
    expect(mock.received().equals(data)).toBe(true)
  })

  it('מפצל קובץ גדול למנות של 8MB ומרכיב אותו נכון בצד השני', async () => {
    // 20MB — שלוש מנות (8 + 8 + 4). תוכן פסאודו-אקראי כדי שהרכבה שגויה תתגלה.
    const total = 20 * 1024 * 1024
    const data = Buffer.alloc(total)
    for (let i = 0; i < total; i++) data[i] = (i * 31 + 7) & 0xff

    const mock = mockDrive()
    const url = await listen(mock.server)

    const res = await uploadToSession(url, data, 0)

    expect(res.ok).toBe(true)
    expect(mock.received().length).toBe(total)
    expect(mock.received().equals(data)).toBe(true)
    // ⚠️ הטווחים חייבים להיות רצופים ולא חופפים — טעות כאן מייצרת קובץ פגום
    expect(mock.ranges).toEqual([
      `bytes 0-${CHUNK - 1}/${total}`,
      `bytes ${CHUNK}-${2 * CHUNK - 1}/${total}`,
      `bytes ${2 * CHUNK}-${total - 1}/${total}`,
    ])
  })

  it('ממשיך מהנקודה הנכונה אחרי ניתוק באמצע ההעלאה', async () => {
    const total = 20 * 1024 * 1024
    const data = Buffer.alloc(total)
    for (let i = 0; i < total; i++) data[i] = (i * 17 + 3) & 0xff

    const mock = mockDrive({ failAt: 1, failMode: 'reset' })
    const url = await listen(mock.server)

    const res = await uploadToSession(url, data, 0)

    expect(res.ok).toBe(true)
    expect(mock.received().equals(data)).toBe(true)
  })

  it('אינו משכפל בייטים כשהמנה נקלטה אך התשובה אבדה', async () => {
    // המנה השנייה נקלטה חלקית (2MB) ואז החיבור נותק. בלי שאילתת המצב
    // ההעלאה הייתה נשלחת מהיסט שגוי והקובץ היה יוצא פגום.
    const total = 20 * 1024 * 1024
    const data = Buffer.alloc(total)
    for (let i = 0; i < total; i++) data[i] = (i * 13 + 5) & 0xff

    const mock = mockDrive({ failAt: 1, failMode: 'reset', swallowBytes: 2 * 1024 * 1024 })
    const url = await listen(mock.server)

    const res = await uploadToSession(url, data, 0)

    expect(res.ok).toBe(true)
    expect(mock.received().length).toBe(total)
    expect(mock.received().equals(data)).toBe(true)
  })

  it('מנסה שוב אחרי 5xx זמני מצד גוגל', async () => {
    const total = 12 * 1024 * 1024
    const data = Buffer.alloc(total, 0x41)
    const mock = mockDrive({ failAt: 0, failMode: 'server-error' })
    const url = await listen(mock.server)

    const res = await uploadToSession(url, data, 0)

    expect(res.ok).toBe(true)
    expect(mock.received().equals(data)).toBe(true)
  })

  it('נכשל מיד על שגיאת הרשאה — בלי ניסיונות חוזרים מיותרים', async () => {
    let calls = 0
    const server = createServer((req, res) => {
      calls++
      req.resume()
      res.writeHead(403).end('insufficientPermissions')
    })
    const url = await listen(server)

    const out = await uploadToSession(url, Buffer.from('x'.repeat(1000)), 0)
    expect(out.ok).toBe(false)
    expect(out.error).toContain('403')
    expect(calls).toBe(1)
  })
})
