// בדיקות להעלאה ה-resumable ל-Drive — מול שרת מדומה שמדבר את הפרוטוקול
// האמיתי של גוגל (308 + Range, שאילתת מצב, וסגירה בגודל לא ידוע).
//
// זו הלוגיקה שהחליפה את multipart שנכשל ב-EPROTO, וגם את בניית הגיבוי
// בזיכרון. מה שחשוב לוודא: שהבייטים שמגיעים לצד השני זהים למקור, שהגודל
// מוצהר נכון כשהוא נודע רק בסוף, ושכשל באמצע ממשיך מהנקודה הנכונה במקום
// לשלוח מנה פעמיים ולייצר קובץ פגום.
import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'http'
import { AddressInfo } from 'net'
import { uploadStreamToSession } from './googleDrive'

const CHUNK = 8 * 1024 * 1024

type Opts = {
  failAt?: number
  failMode?: 'reset' | 'server-error'
  swallowBytes?: number
}

// שרת שמצטבר את מה שהתקבל, כמו סשן resumable אמיתי.
function mockDrive(opts: Opts = {}) {
  const received: Buffer[] = []
  let got = 0
  let chunkIndex = 0
  let failed = false
  const ranges: string[] = []
  let declaredTotal: number | null = null

  const server = createServer((req, res) => {
    const contentRange = String(req.headers['content-range'] ?? '')
    ranges.push(contentRange)

    // שאילתת מצב ("bytes */*") או סגירה בגודל ידוע ("bytes */<total>") — בלי גוף
    const starMatch = /^bytes \*\/(\*|\d+)$/.exec(contentRange)
    if (starMatch) {
      req.resume()
      const declared = starMatch[1]
      if (declared !== '*') {
        // סגירה: הגודל הוצהר. אם כבר קיבלנו את הכל — סיום מוצלח.
        declaredTotal = Number(declared)
        if (got >= declaredTotal) {
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: 'file-123' }))
          return
        }
      }
      if (got === 0) { res.writeHead(308).end(); return }
      res.writeHead(308, { Range: `bytes=0-${got - 1}` }).end()
      return
    }

    const m = /^bytes (\d+)-(\d+)\/(\*|\d+)$/.exec(contentRange)
    if (!m) { req.resume(); res.writeHead(400).end('bad content-range'); return }
    const total = m[3] === '*' ? null : Number(m[3])

    const body: Buffer[] = []
    req.on('data', c => body.push(c))
    req.on('end', () => {
      const idx = chunkIndex++
      const buf = Buffer.concat(body)

      if (!failed && opts.failAt === idx) {
        failed = true
        if (opts.swallowBytes) { received.push(buf.subarray(0, opts.swallowBytes)); got += opts.swallowBytes }
        if (opts.failMode === 'server-error') { res.writeHead(503).end('slow down'); return }
        res.destroy()
        return
      }

      received.push(buf)
      got += buf.length
      if (total != null) { declaredTotal = total }
      // סיום רק כשהגודל הוצהר והתקבל במלואו — בגודל לא ידוע ממשיכים ב-308.
      if (declaredTotal != null && got >= declaredTotal) {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: 'file-123' }))
        return
      }
      res.writeHead(308, { Range: `bytes=0-${got - 1}` }).end()
    })
  })

  return { server, received: () => Buffer.concat(received), ranges: () => ranges }
}

let active: Server | null = null
afterEach(() => { active?.close(); active = null })

async function listen(server: Server): Promise<string> {
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  active = server
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/session`
}

// זרם שמחזיר את הנתונים בפיסות בגודל נתון — מדמה את הזרם של archiver,
// שאינו מיושר לגבולות המנות של גוגל.
async function* pieces(data: Buffer, size: number) {
  for (let i = 0; i < data.length; i += size) yield data.subarray(i, Math.min(i + size, data.length))
}

function pattern(len: number, seed: number): Buffer {
  const b = Buffer.alloc(len)
  for (let i = 0; i < len; i++) b[i] = (i * seed + 7) & 0xff
  return b
}

describe('uploadStreamToSession — העלאה מזרם בגודל לא ידוע', () => {
  it('מעלה זרם קטן במנה אחת ומצהיר על הגודל בסוף', async () => {
    const data = Buffer.from('גיבוי קטן'.repeat(100), 'utf8')
    const mock = mockDrive()
    const url = await listen(mock.server)

    const res = await uploadStreamToSession(url, pieces(data, 1000), 0)

    expect(res.ok).toBe(true)
    expect(res.id).toBe('file-123')
    expect(res.bytes).toBe(data.length)
    expect(mock.received().equals(data)).toBe(true)
    // מנה בודדת — הגודל האמיתי מוצהר עליה
    expect(mock.ranges()).toEqual([`bytes 0-${data.length - 1}/${data.length}`])
  })

  it('מפצל זרם גדול למנות של 8MB — ביניים עם /*, אחרונה עם הגודל', async () => {
    // 20MB בפיסות של 64KB: הזרם אינו מיושר לגבולות המנות, כמו archiver.
    const total = 20 * 1024 * 1024
    const data = pattern(total, 31)
    const mock = mockDrive()
    const url = await listen(mock.server)

    const res = await uploadStreamToSession(url, pieces(data, 64 * 1024), 0)

    expect(res.ok).toBe(true)
    expect(res.bytes).toBe(total)
    expect(mock.received().equals(data)).toBe(true)
    expect(mock.ranges()).toEqual([
      `bytes 0-${CHUNK - 1}/*`,
      `bytes ${CHUNK}-${2 * CHUNK - 1}/*`,
      `bytes ${2 * CHUNK}-${total - 1}/${total}`,
    ])
  })

  it('⚠️ זרם שנגמר בדיוק על גבול מנה — נשלחת בקשת סגירה נפרדת', async () => {
    // בלי בקשת הסגירה גוגל הייתה ממתינה להמשך שלא יגיע, והגיבוי היה נשאר
    // תלוי באוויר בלי שגיאה ובלי קובץ.
    const total = 2 * CHUNK
    const data = pattern(total, 17)
    const mock = mockDrive()
    const url = await listen(mock.server)

    const res = await uploadStreamToSession(url, pieces(data, CHUNK), 0)

    expect(res.ok).toBe(true)
    expect(res.bytes).toBe(total)
    expect(mock.received().equals(data)).toBe(true)
    expect(mock.ranges()).toEqual([
      `bytes 0-${CHUNK - 1}/*`,
      `bytes ${CHUNK}-${2 * CHUNK - 1}/*`,
      `bytes */${total}`,
    ])
  })

  it('ממשיך מהנקודה הנכונה אחרי ניתוק באמצע', async () => {
    const total = 20 * 1024 * 1024
    const data = pattern(total, 13)
    const mock = mockDrive({ failAt: 1, failMode: 'reset' })
    const url = await listen(mock.server)

    const res = await uploadStreamToSession(url, pieces(data, 64 * 1024), 0)

    expect(res.ok).toBe(true)
    expect(mock.received().equals(data)).toBe(true)
  })

  it('אינו משכפל בייטים כשהמנה נקלטה חלקית והתשובה אבדה', async () => {
    const total = 20 * 1024 * 1024
    const data = pattern(total, 23)
    const mock = mockDrive({ failAt: 1, failMode: 'reset', swallowBytes: 2 * 1024 * 1024 })
    const url = await listen(mock.server)

    const res = await uploadStreamToSession(url, pieces(data, 64 * 1024), 0)

    expect(res.ok).toBe(true)
    expect(mock.received().length).toBe(total)
    expect(mock.received().equals(data)).toBe(true)
  })

  it('מנסה שוב אחרי 5xx זמני מצד גוגל', async () => {
    const total = 12 * 1024 * 1024
    const data = pattern(total, 41)
    const mock = mockDrive({ failAt: 0, failMode: 'server-error' })
    const url = await listen(mock.server)

    const res = await uploadStreamToSession(url, pieces(data, 64 * 1024), 0)

    expect(res.ok).toBe(true)
    expect(mock.received().equals(data)).toBe(true)
  })

  it('נכשל מיד על שגיאת הרשאה — בלי ניסיונות חוזרים', async () => {
    let calls = 0
    const server = createServer((req, res) => {
      calls++
      req.resume()
      res.writeHead(403).end('insufficientPermissions')
    })
    const url = await listen(server)

    const out = await uploadStreamToSession(url, pieces(Buffer.alloc(1000, 1), 1000), 0)
    expect(out.ok).toBe(false)
    expect(out.error).toContain('403')
    expect(calls).toBe(1)
  })

  it('זרם ריק אינו נשלח כלל — גיבוי ריק אינו גיבוי', async () => {
    const mock = mockDrive()
    const url = await listen(mock.server)

    const res = await uploadStreamToSession(url, pieces(Buffer.alloc(0), 1000), 0)

    expect(res.ok).toBe(false)
    expect(res.error).toContain('ריק')
    expect(mock.ranges()).toEqual([])
  })
})
