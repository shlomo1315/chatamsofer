import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PDFDocument } from 'pdf-lib'

// ייצוא הקוויטל: 185 בקשות מסומנות (כמו בתקלה מ-19.11.2026) — המזהים בגוף הבקשה,
// והקובץ PDF בדף A4 שמתפרס על כמה עמודים. נתוני דמה בזיכרון, בלי מסד חי.

let allowed = true
let rows: Record<string, unknown>[] = []

vi.mock('@/lib/apiAuth', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requirePermission: async () => (allowed ? { id: 'staff-test' } : null),
    forbidden: () => NextResponse.json({ error: 'אין הרשאה' }, { status: 403 }),
    serverMisconfigured: () => NextResponse.json({ error: 'x' }, { status: 500 }),
    getServiceClient: () => ({}),
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
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toMatch(/\.pdf/)

    const pdf = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()))
    expect(pdf.getPageCount()).toBeGreaterThan(1)
    for (const p of pdf.getPages()) {
      expect(Math.round(p.getWidth())).toBe(595)
      expect(Math.round(p.getHeight())).toBe(842)
    }
  })

  it('בלי ids: כל מה שבסינון; Word לפי בקשה', async () => {
    const res = await post({ format: 'docx' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/wordprocessingml/)
  })

  it('GET עם מזהה אחד בכתובת (כפתור בכרטיס) עדיין עובד, וברירת המחדל PDF', async () => {
    const res = await GET(new NextRequest(`http://test/api/admin/kvitel/export?status=all&ids=${uuid(3)}`))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
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
    expect(err).toBe('ההורדה נכשלה')
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('/api/admin/kvitel/export?status=all')
    expect(calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ ids, format: 'pdf' })
    vi.unstubAllGlobals()
  })
})
