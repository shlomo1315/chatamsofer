import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_LINEAGE_FAULT_TEMPLATE, LINEAGE_FAULT_TEMPLATE_KEY, type FaultRow } from './lineageFaultNotice'

// מסד דמה בזיכרון ומשלוח מדומה: שום מייל אמיתי לא יוצא מהבדיקה הזו.
let families: FaultRow[]
let sentLog: { entity_id: string }[]
let settings: Record<string, string>
const delivered: { to: string; subject: string; html: string }[] = []

function table(name: string) {
  const result = () => {
    if (name === 'beneficiaries') return { data: families, error: null }
    if (name === 'activity_log') return { data: sentLog, error: null }
    return { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'range']) b[m] = () => b
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve(result()).then(ok)
  b.maybeSingle = async () => ({ data: settings[LINEAGE_FAULT_TEMPLATE_KEY] ? { value: settings[LINEAGE_FAULT_TEMPLATE_KEY] } : null, error: null })
  b.insert = async () => ({ error: null })
  b.update = () => ({ eq: async () => ({ error: null }) })
  b.upsert = async (row: { key: string; value: string }) => { settings[row.key] = row.value; return { error: null } }
  return b
}

vi.mock('@/lib/apiAuth', async () => {
  const { NextResponse } = await import('next/server')
  return {
    requirePermission: async () => ({ userId: 'u1' }),
    forbidden: () => NextResponse.json({ error: 'אין הרשאה' }, { status: 403 }),
    getServiceClient: () => ({ from: table }),
  }
})
vi.mock('@/lib/sendMail', () => ({
  deliverMail: async (to: string, subject: string, html: string) => { delivered.push({ to, subject, html }); return { ok: true } },
}))
vi.mock('@/lib/activityLog', () => ({
  logActivity: async (_a: unknown, e: { entityId: string }) => { sentLog.push({ entity_id: e.entityId }) },
}))
vi.mock('@/lib/emailTextsStore', () => ({ ensureEmailTexts: async () => {} }))
vi.mock('@/lib/departments', () => ({ mailFor: () => ({ fromName: 'איגוד', fromEmail: 'igud@chasamsofer.info' }) }))

import { POST } from '@/app/api/admin/beneficiaries/lineage-fault-notice/route'

const call = async (body: unknown) => {
  const res = await POST({ json: async () => body } as never)
  return { status: res.status, data: await res.json() }
}

const edited = {
  ...DEFAULT_LINEAGE_FAULT_TEMPLATE,
  subject: 'נוסח ערוך למשפחת {{שם המשפחה}}',
  title: 'כותרת ערוכה',
  bodyHtml: '<p>שלום משפחת {{שם המשפחה}}, <strong>פסקה ערוכה</strong>.</p><script>alert(1)</script>',
  buttonLabel: 'כפתור ערוך',
  note: 'הערה ערוכה',
}

beforeEach(() => {
  families = [{ id: 'b1', full_name: 'משה', family_name: 'לוי', spouse_name: null, email: 'levi@example.com', lineage_node_id: 'n1' }]
  sentLog = []
  settings = {}
  delivered.length = 0
})

describe('נוסח ההודעה על תקלה בסדר הדורות', () => {
  it('render מחזיר את הנוסח שנשלח בבקשה, עם השם ובלי סקריפטים, ולא שומר', async () => {
    const { data } = await call({ action: 'render', template: edited, sampleName: 'לוי משה' })
    expect(data.subject).toBe('נוסח ערוך למשפחת לוי משה')
    expect(data.html).toContain('שלום משפחת לוי משה')
    expect(data.html).toContain('<strong>פסקה ערוכה</strong>')
    expect(data.html).toContain('כותרת ערוכה')
    expect(data.html).toContain('כפתור ערוך')
    expect(data.html).not.toContain('<script')
    expect(settings).toEqual({})
  })

  it('בלי נוסח שמור התצוגה והשליחה בנוסח ברירת המחדל', async () => {
    const { data } = await call({})
    expect(data.template).toEqual(DEFAULT_LINEAGE_FAULT_TEMPLATE)
    expect(data.sample.subject).toBe(DEFAULT_LINEAGE_FAULT_TEMPLATE.subject)
    expect(data.sample.html).toContain('לא תהיה אפשרות לקבל את הכרטיס של מענק חג החנוכה')
  })

  it('הנוסח הערוך שנשמר הוא מה שנשלח בפועל, עם הקישור האישי', async () => {
    expect((await call({ action: 'save', template: edited })).status).toBe(200)

    const pre = await call({})
    expect(pre.data.template.subject).toBe(edited.subject)
    expect(pre.data.sample.subject).toBe('נוסח ערוך למשפחת לוי משה')

    const { data } = await call({ send: true })
    expect(data).toMatchObject({ sent: 1, remaining: 0 })
    expect(delivered).toHaveLength(1)
    const m = delivered[0]
    expect(m.to).toBe('levi@example.com')
    expect(m.subject).toBe('נוסח ערוך למשפחת לוי משה')
    expect(m.html).toContain('שלום משפחת לוי משה')
    expect(m.html).toContain('פסקה ערוכה')
    expect(m.html).toContain('כפתור ערוך')
    expect(m.html).toContain('הערה ערוכה')
    expect(m.html).toMatch(/\/lineage-review\/[A-Za-z0-9_-]{20,}"/)
    expect(m.html).not.toContain('<script')
    expect(m.html).not.toContain('{{שם המשפחה}}')
  })

  it('נוסח שמגיע עם בקשת השליחה לא משפיע: נשלח רק הנוסח השמור', async () => {
    await call({ send: true, template: edited })
    expect(delivered[0].subject).toBe(DEFAULT_LINEAGE_FAULT_TEMPLATE.subject)
  })

  it('משפחה שקיבלה לא מקבלת שוב גם אחרי שינוי נוסח', async () => {
    await call({ send: true })
    await call({ action: 'save', template: edited })
    const { data } = await call({ send: true })
    expect(data.sent).toBe(0)
    expect(delivered).toHaveLength(1)
  })
})
