import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PDFDocument } from 'pdf-lib'

// ייצוא הקוויטל: 185 בקשות מסומנות (כמו בתקלה מ-19.11.2026) — המזהים בגוף הבקשה,
// והקובץ PDF בדף A4 שמתפרס על כמה עמודים. נתוני דמה בזיכרון, בלי מסד חי.

let allowed = true
let rows: Record<string, unknown>[] = []
// מנה שנסגרה — לנתיב ההורדה החוזרת (batches/[id]/file)
let batch: { closed_at: string; lines: string[] } | null = null
const fakeDb = {
  from: () => ({ select: () => ({
    eq: () => ({ maybeSingle: async () => ({ data: batch, error: null }) }),
    // המנה האחרונה (השבוע הפתוח) — אין מנות קודמות
    order: () => ({ limit: async () => ({ data: [], error: null }) }),
  }) }),
}

vi.mock('@/lib/apiAuth', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requirePermission: async () => (allowed ? { id: 'staff-test' } : null),
    forbidden: () => NextResponse.json({ error: 'אין הרשאה' }, { status: 403 }),
    serverMisconfigured: () => NextResponse.json({ error: 'x' }, { status: 500 }),
    getServiceClient: () => fakeDb,
  }
})
vi.mock('@/lib/kvitelQuery', async (orig) => ({
  ...(await orig<typeof import('@/lib/kvitelQuery')>()),
  loadKvitelRequests: async () => ({ rows, error: null }),
}))

import { POST, GET } from '@/app/api/admin/kvitel/export/route'

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const row = (i: number, status = 'pending') => ({
  id: uuid(i), channel: 'web', status, contact_name: null, contact_phone: null, contact_email: null,
  raw_text: null, recording_url: null, note: null, submitted_at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(), done_at: null,
  kvitel_request_lines: [{ id: `l${i}`, position: 0, name: `ישראל ${i}`, relation: 'בן', parent_name: 'שרה', request_type: 'refua', request_note: null }],
})
const post = (body: unknown, query = 'status=all') => POST(new NextRequest(`http://test/api/admin/kvitel/export?${query}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}))

// הקובץ מגיע כ-JSON מעורבל: בלי חתימת PDF/ZIP גלויה, ואחרי פענוח — הקובץ המלא.
// ⚠️ תגובת application/pdf ישירה נחסמה בנטפרי ("ההורדה נכשלה" בסגירת המנה, 19.11.2026).
async function fileFrom(res: Response) {
  const { scrambleBytes } = await import('@/lib/docCipher')
  expect(res.headers.get('Content-Type')).toMatch(/json/)
  const payload = await res.json()
  expect(payload.enc).toBeTruthy()
  expect(payload.data.startsWith('JVBER')).toBe(false) // %PDF ב-base64
  expect(payload.data.startsWith('UEsD')).toBe(false) // PK (docx) ב-base64
  const bytes = scrambleBytes(new Uint8Array(Buffer.from(payload.data, 'base64')))
  return { ...payload, bytes } as { name: string; contentType: string; bytes: Uint8Array }
}

beforeEach(() => {
  allowed = true
  rows = [...Array.from({ length: 200 }, (_, i) => row(i + 1)), row(900, 'cancelled')]
})

describe('ייצוא קוויטל', () => {
  it('185 מזהים בגוף הבקשה: PDF, כל העמודים A4, רק הבקשות שנבחרו', async () => {
    const ids = Array.from({ length: 185 }, (_, i) => uuid(i + 1))
    // אורך הכתובת הישנה — מעבר למגבלת ה-WAF (2048) שחסמה את ההורדה
    expect(`ids=${ids.join(',')}`.length).toBeGreaterThan(2048)

    const res = await post({ ids })
    expect(res.status).toBe(200)
    const file = await fileFrom(res)
    expect(file.contentType).toBe('application/pdf')
    expect(file.name).toMatch(/\.pdf$/)

    const pdf = await PDFDocument.load(file.bytes)
    expect(pdf.getPageCount()).toBeGreaterThan(1)
    for (const p of pdf.getPages()) {
      expect(Math.round(p.getWidth())).toBe(595)
      expect(Math.round(p.getHeight())).toBe(842)
    }
  })

  it('בלי ids: כל מה שבסינון; Word לפי בקשה', async () => {
    const res = await post({ format: 'docx' })
    expect(res.status).toBe(200)
    const file = await fileFrom(res)
    expect(file.contentType).toMatch(/wordprocessingml/)
    expect(String.fromCharCode(file.bytes[0], file.bytes[1])).toBe('PK')
  })

  it('GET עם מזהה אחד בכתובת (כפתור בכרטיס) עדיין עובד, וברירת המחדל PDF', async () => {
    const res = await GET(new NextRequest(`http://test/api/admin/kvitel/export?status=all&ids=${uuid(3)}`))
    expect(res.status).toBe(200)
    expect((await fileFrom(res)).contentType).toBe('application/pdf')
  })

  it('קלט לא תקין או בלי הרשאה: שגיאה עם הודעה, בלי קובץ', async () => {
    expect((await post({ ids: ['x'] })).status).toBe(400)
    expect((await post({ ids: 'abc' })).status).toBe(400)
    expect((await post({ format: 'exe' })).status).toBe(400)
    expect((await post({ ids: [uuid(900)] })).status).toBe(404) // בוטל — לא נכנס לקובץ
    allowed = false
    const res = await post({ ids: [uuid(1)] })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBeTruthy()
  })
})

describe('לוגו לתצוגה המקדימה', () => {
  it('מגיע כ-JSON מעורבל (בלי חתימת PNG גלויה), ואחרי פענוח זה הלוגו המלא', async () => {
    const { GET: logo } = await import('@/app/api/admin/kvitel/logo/route')
    const { scrambleBytes } = await import('@/lib/docCipher')
    const res = await logo()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/json/)
    const { enc, data } = await res.json()
    expect(enc).toBeTruthy()
    expect(data.startsWith('iVBOR')).toBe(false) // חתימת PNG ב-base64
    const bytes = scrambleBytes(new Uint8Array(Buffer.from(data, 'base64')))
    expect([...bytes.slice(1, 4)].map(b => String.fromCharCode(b)).join('')).toBe('PNG')
    const img = await PDFDocument.create().then(d => d.embedPng(bytes))
    expect(img.width).toBe(900)
    expect(img.height).toBe(903)
    allowed = false
    expect((await logo()).status).toBe(403)
  })
})

describe('downloadKvitel (הדפדפן)', () => {
  it('שולח POST עם המזהים בגוף ולא בכתובת; חסימה מחזירה שגיאה, ולכן הסימון "נשלחו" לא רץ', async () => {
    const { downloadKvitel } = await import('@/app/admin/kvitel/KvitelPreview')
    const calls: [string, RequestInit | undefined][] = []
    vi.stubGlobal('fetch', async (u: string, init?: RequestInit) => {
      calls.push([u, init])
      return new Response('<html>403 Forbidden</html>', { status: 403 })
    })
    const ids = Array.from({ length: 185 }, (_, i) => uuid(i + 1))
    const err = await downloadKvitel('/api/admin/kvitel/export?status=all', ids)
    expect(err).toBe('ההורדה נכשלה (403)')
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('/api/admin/kvitel/export?status=all')
    expect(calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ ids, format: 'pdf' })
    vi.unstubAllGlobals()
  })
})

describe('סגירת המנה מקצה לקצה: print-file → downloadKvitel', () => {
  it('הקובץ של השבוע מגיע מעורבל, והדפדפן מפענח אותו ל-PDF תקין ומוריד אותו', async () => {
    const { POST: printFile } = await import('@/app/api/admin/kvitel/print-file/route')
    const { downloadKvitel } = await import('@/app/admin/kvitel/KvitelPreview')
    const ids = Array.from({ length: 200 }, (_, i) => uuid(i + 1))

    let blob: Blob | null = null
    let name = ''
    vi.stubGlobal('fetch', async (u: string, init?: RequestInit) =>
      printFile(new NextRequest(`http://test${u}`, init as ConstructorParameters<typeof NextRequest>[1])))
    const spy = vi.spyOn(URL, 'createObjectURL').mockImplementation(b => { blob = b as Blob; return 'blob:test' })
    vi.stubGlobal('document', {
      createElement: () => ({ click() {}, remove() {}, set download(v: string) { name = v }, href: '' }),
      body: { appendChild() {} },
    })

    const err = await downloadKvitel('/api/admin/kvitel/print-file', ids, 'pdf')
    vi.unstubAllGlobals()
    spy.mockRestore()
    expect(err).toBeNull()
    expect(name).toMatch(/^קוויטל-\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(blob!.type).toBe('application/pdf')
    const pdf = await PDFDocument.load(new Uint8Array(await blob!.arrayBuffer()))
    expect(pdf.getPageCount()).toBeGreaterThan(1)
  })

  it('תגובה שאינה JSON (דף חסימה של נטפרי, 418): שגיאה עם הקוד, בלי הורדה', async () => {
    const { downloadKvitel } = await import('@/app/admin/kvitel/KvitelPreview')
    vi.stubGlobal('fetch', async () => new Response('<html>Blocked by NetFree</html>', { status: 418 }))
    expect(await downloadKvitel('/api/admin/kvitel/print-file', [uuid(1)])).toBe('ההורדה נכשלה (418)')
    vi.unstubAllGlobals()
  })
})

describe('הורדה חוזרת של מנה קודמת', () => {
  it('נבנית מהשורות שנרשמו, בתאריך הסגירה, ומגיעה מעורבלת', async () => {
    const { POST: batchFile } = await import('@/app/api/admin/kvitel/batches/[id]/file/route')
    const call = (id: string, format: string) => batchFile(new NextRequest('http://test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format }),
    }), { params: Promise.resolve({ id }) })

    batch = { closed_at: '2026-11-19T10:00:00Z', lines: ['ישראל בן שרה', 'משה בן רחל'] }
    const res = await call(uuid(5), 'pdf')
    expect(res.status).toBe(200)
    const file = await fileFrom(res)
    expect(file.name).toBe('קוויטל-2026-11-19.pdf')
    expect((await PDFDocument.load(file.bytes)).getPageCount()).toBe(1)

    batch = null
    expect((await call(uuid(5), 'pdf')).status).toBe(404)
    expect((await call('x', 'pdf')).status).toBe(400)
  })
})
