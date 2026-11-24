import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_LINEAGE_FAULT_TEMPLATE, LINEAGE_FAULT_TEMPLATE_KEY, type FaultRow } from './lineageFaultNotice'

// מסד דמה בזיכרון ומשלוח מדומה: שום מייל אמיתי לא יוצא מהבדיקה הזו.
let families: (FaultRow & { deep_review_reason?: string | null })[]
let sentLog: { entity_id: string; created_at: string }[]
let settings: Record<string, string>
const delivered: { to: string; subject: string; html: string }[] = []

function table(name: string) {
  let since = ''
  const result = () => {
    if (name === 'beneficiaries') return { data: families, error: null }
    if (name === 'activity_log') return { data: sentLog.filter(s => !since || s.created_at >= since), error: null }
    return { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'range']) b[m] = () => b
  b.gte = (c: string, v: string) => { if (c === 'created_at') since = v; return b }
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
  logActivity: async (_a: unknown, e: { entityId: string }) => { sentLog.push({ entity_id: e.entityId, created_at: new Date().toISOString() }) },
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

  it('נוסח שמור בלי שם המשפחה לא נשלח לאף אחד', async () => {
    await call({ action: 'save', template: { ...edited, bodyHtml: '<p>שלום רב</p>' } })
    const { status, data } = await call({ send: true })
    expect(status).toBe(400)
    expect(data.error).toContain('שם המשפחה')
    expect(delivered).toHaveLength(0)
    expect(sentLog).toHaveLength(0)
  })

  it('ברירת המחדל נשלחת בעיצוב שאושר: פס כתום מימין ותקציר קבוע', async () => {
    await call({ send: true })
    const html = delivered[0].html
    expect(html).toContain('border-right:4px solid #d97706')
    expect(html).toContain('color:#475569;font-size:15px;line-height:1.8')
    expect(html).toContain('התגלתה תקלה בסדר הדורות הרשום אצלכם')
    expect(html).toContain('text-align:center;margin:0 0 18px;')
  })
})

describe('סבב חוזר (תזכורת)', () => {
  const yesterday = new Date(Date.now() - 2 * 86400_000).toISOString()

  beforeEach(() => {
    families = [
      // קיבלה בסבב הקודם ועדיין לא הסדירה
      { id: 'old', full_name: 'משה', family_name: 'לוי', spouse_name: null, email: 'levi@example.com', lineage_node_id: 'n1', deep_review_reason: 'דור 2–5 אינו בקובץ המאושר (דור 4: בנימין)' },
      // בלי מייל
      { id: 'nomail', full_name: 'דוד', family_name: 'כהן', spouse_name: null, email: null, lineage_node_id: 'n1', deep_review_reason: null },
      // בבדיקה מעמיקה מסיבה שהמזכירות הקלידה
      { id: 'manual', full_name: 'יוסף', family_name: 'פרידמן', spouse_name: null, email: 'f@example.com', lineage_node_id: 'n1', deep_review_reason: 'חסר אישור רב קהילה' },
    ]
    sentLog = [{ entity_id: 'old', created_at: yesterday }]
  })

  it('הסבב הרגיל חוסם את מי שקיבל אי פעם', async () => {
    const { data } = await call({})
    expect(data.alreadySent).toBe(1)
    expect(data.toSend).toBe(1) // manual, כי הסבב הרגיל לא מסנן לפי סיבה
  })

  it('תזכורת: נשלחת למי שקיבל אתמול, בלי מייל מוצגים בנפרד, וסיבה ידנית לא מקבלת', async () => {
    const { data } = await call({ resend: true })
    expect(data).toMatchObject({ dryRun: true, resend: true, total: 3, toSend: 1, alreadySent: 0 })
    expect(data.noEmail.map((p: { id: string }) => p.id)).toEqual(['nomail'])
    expect(data.otherReason.map((p: { id: string }) => p.id)).toEqual(['manual'])
    expect(data.sample.to).toBe('levi@example.com')
    expect(delivered).toHaveLength(0) // תצוגה מקדימה לא שולחת

    const sent = await call({ send: true, resend: true })
    expect(sent.data).toMatchObject({ sent: 1, remaining: 0 })
    expect(delivered.map(d => d.to)).toEqual(['levi@example.com'])
  })

  it('תזכורת שנייה באותו יום לא שולחת שוב', async () => {
    await call({ send: true, resend: true })
    expect(delivered).toHaveLength(1)
    const again = await call({ send: true, resend: true })
    expect(again.data).toMatchObject({ sent: 0, remaining: 0 })
    expect(delivered).toHaveLength(1)
    const { data } = await call({ resend: true })
    expect(data).toMatchObject({ toSend: 0, alreadySent: 1 })
  })
})

describe('israelDayStart', () => {
  it('חצות בשעון ישראל, בחורף ובקיץ', async () => {
    const { israelDayStart } = await import('./lineageFaultNotice')
    expect(israelDayStart(new Date('2026-11-24T22:30:00Z'))).toBe('2026-11-24T22:00:00.000Z') // כבר 25.11 בישראל
    expect(israelDayStart(new Date('2026-11-24T21:30:00Z'))).toBe('2026-11-23T22:00:00.000Z') // עדיין 24.11
    expect(israelDayStart(new Date('2026-11-24T10:00:00Z'))).toBe('2026-11-23T22:00:00.000Z')
    expect(israelDayStart(new Date('2026-07-01T10:00:00Z'))).toBe('2026-06-30T21:00:00.000Z')
  })
})
