import { describe, it, expect, vi, beforeEach } from 'vitest'

// מסד דמה בזיכרון עם קמפיין בדיקה, בלי נתונים חיים
let row: Record<string, unknown> | null
let allowed = true

vi.mock('@/lib/apiAuth', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requirePermission: async () => (allowed ? { userId: 'u1' } : null),
    forbidden: () => NextResponse.json({ error: 'אין הרשאה' }, { status: 403 }),
    getServiceClient: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row ? { status: row.status } : null }) }) }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => { row = { ...row, ...patch }; return { error: null } },
        }),
      }),
    }),
  }
})

import { PATCH } from '@/app/api/admin/campaigns/[id]/route'

const call = (body: unknown) =>
  PATCH({ json: async () => body } as never, { params: Promise.resolve({ id: 'c1' }) })

beforeEach(() => {
  allowed = true
  row = { id: 'c1', status: 'draft', name: 'רישום לחנוכה', content: { mode: 'blocks', blocks: [] } }
})

describe('שמירת קמפיין (PATCH)', () => {
  it('שומר תוכן עם HTML, קישורים ומשתני מיזוג כמו שהוא', async () => {
    const blocks = [
      { id: 'a', type: 'heading', level: 1, content: 'שלום {{שם_משפחה}}' },
      { id: 'b', type: 'text', content: '<p>לפרטים <a href="https://chasamsofer.co.il/x" target="_blank"><strong>לחצו</strong></a></p>{{#מוקד}}<div>{{מוקד}}</div>{{/מוקד}}' },
      { id: 'c', type: 'button', label: 'להרשמה', url: 'https://chasamsofer.co.il/r' },
    ]
    const res = await call({ name: 'רישום לחנוכה תשפ"ז', content: { mode: 'blocks', blocks }, content_mode: 'blocks' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(row!.name).toBe('רישום לחנוכה תשפ"ז')
    expect(row!.content).toEqual({ mode: 'blocks', blocks })
  })

  it('מנקה קוד מסוכן לפני השמירה', async () => {
    await call({ raw_html: '<p onclick="x()">טקסט</p><script>alert(1)</script>', content_mode: 'html' })
    expect(row!.raw_html).toBe('<p>טקסט</p>')
  })

  it('לא שומר בלי הרשאת עריכה', async () => {
    allowed = false
    const res = await call({ name: 'x' })
    expect(res.status).toBe(403)
    expect(row!.name).toBe('רישום לחנוכה')
  })

  it('לא שומר קמפיין שכבר נשלח', async () => {
    row!.status = 'sent'
    const res = await call({ name: 'x' })
    expect(res.status).toBe(400)
    expect(row!.name).toBe('רישום לחנוכה')
  })
})
