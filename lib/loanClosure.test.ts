import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { serializeGates, resolveGates, activeClosedMessages, departmentClosedMessage, closedMessageFor, DEFAULT_GATES } from './departmentGates'

// ─────────────────────────────────────────────────────────────────────────────
// סגירת הגשת בקשות הלוואה: מתג הגמ"ח כבוי + הודעת סגירה שמורה.
// כל ערוץ הגשה (פורטל, טיוטה, כפתור המייל, קליטת המייל) מחזיר את אותו נוסח.
// ─────────────────────────────────────────────────────────────────────────────

const MSG = 'לעת עתה אין אפשרות להגיש בקשות הלוואה חדשות'

let gatesValue: string | null = null
const inserts: string[] = []

// מסד מדומה: app_settings מחזיר את השערים, כל השאר ריק. כל insert נרשם.
const db = {
  from: (table: string) => {
    const q: Record<string, unknown> = {}
    let key = ''
    const chain = () => q
    q.select = chain; q.order = chain; q.or = chain; q.in = chain; q.limit = chain
    q.eq = (col: string, v: string) => { if (col === 'key') key = v; return q }
    q.insert = () => { inserts.push(table); return q }
    q.upsert = () => { inserts.push(table); return q }
    q.single = async () => ({ data: null })
    q.maybeSingle = async () => ({
      data: table === 'app_settings'
        ? (key === 'department_gates' ? (gatesValue === null ? null : { value: gatesValue }) : { value: 'preview-code-123456789012' })
        : null,
    })
    q.then = (res: (v: unknown) => unknown) => res({ data: [] })
    return q
  },
}

vi.mock('@/lib/apiAuth', async (orig) => ({
  ...(await orig<typeof import('@/lib/apiAuth')>()),
  getServiceClient: () => db,
}))
vi.mock('@/lib/emailTextsStore', async (orig) => ({
  ...(await orig<typeof import('@/lib/emailTextsStore')>()),
  ensureEmailTexts: async () => {},
}))
const deliverMail = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/sendMail', () => ({ deliverMail: (...a: unknown[]) => deliverMail(...a) }))

const closeGemach = () => {
  gatesValue = serializeGates({ ...DEFAULT_GATES, gemach: false }, {}, { gemach: MSG })
}
const openGemach = () => {
  gatesValue = serializeGates({ ...DEFAULT_GATES, gemach: true }, {}, { gemach: MSG })
}

const req = (url: string, body?: unknown) => new NextRequest(url, body === undefined
  ? undefined
  : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

beforeEach(() => { inserts.length = 0; deliverMail.mockClear(); closeGemach() })

describe('הודעת הסגירה במנגנון השערים', () => {
  it('נשמרת ונקראת חזרה', () => {
    const r = resolveGates(gatesValue)
    expect(r.gates.gemach).toBe(false)
    expect(r.messages.gemach).toBe(MSG)
  })

  it('מוצגת לציבור רק כשהמחלקה סגורה', () => {
    const closed = resolveGates(gatesValue)
    expect(activeClosedMessages(closed.gates, closed.messages)).toEqual({ gemach: MSG })
    openGemach()
    const open = resolveGates(gatesValue)
    expect(activeClosedMessages(open.gates, open.messages)).toEqual({})
  })

  it('הודעה מותאמת מחליפה את נוסח ברירת המחדל', async () => {
    expect(departmentClosedMessage('gemach', undefined, MSG)).toBe(MSG)
    expect(await closedMessageFor('gemach', db as never)).toBe(MSG)
  })

  it('בלי הודעה מותאמת — נוסח ברירת המחדל נשאר', async () => {
    gatesValue = serializeGates({ ...DEFAULT_GATES, gemach: false }, {}, {})
    expect(await closedMessageFor('gemach', db as never)).toBe(departmentClosedMessage('gemach'))
  })
})

describe('אתר: הגשת בקשת הלוואה בפורטל', () => {
  it('loan-request מחזיר 403 עם הנוסח ולא כותב למסד', async () => {
    const { POST } = await import('@/app/api/portal/loan-request/route')
    const res = await POST(req('https://x.test/api/portal/loan-request', { amount: 5000 }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(MSG)
    expect(inserts).toEqual([])
  })

  it('loan-draft מחזיר 403 עם הנוסח', async () => {
    const { POST } = await import('@/app/api/portal/loan-draft/route')
    const res = await POST(req('https://x.test/api/portal/loan-draft', {}))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(MSG)
  })

  it('השערים הציבוריים מחזירים את ההודעה לפורטל', async () => {
    const { GET } = await import('@/app/api/portal/department-gates/route')
    const res = await GET(req('https://x.test/api/portal/department-gates'))
    const d = await res.json()
    expect(d.gates.gemach).toBe(false)
    expect(d.closedMessages).toEqual({ gemach: MSG })
  })
})

describe('מייל: כפתור "פתיחת טיוטה"', () => {
  it('מחלקה סגורה — דף עם הנוסח במקום טיוטה', async () => {
    const { GET } = await import('@/app/api/request-draft/route')
    const res = await GET(req('https://x.test/api/request-draft?type=loan'))
    expect(res.status).toBe(403)
    expect(await res.text()).toContain(MSG)
  })

  it('raw=1 של מסך העריכה באדמין לא נחסם', async () => {
    const { GET } = await import('@/app/api/request-draft/route')
    const res = await GET(req('https://x.test/api/request-draft?type=loan&raw=1'))
    expect(res.status).toBe(200)
    expect((await res.json()).url).toMatch(/^mailto:/)
  })

  it('סוג של מחלקה אחרת לא מושפע', async () => {
    const { GET } = await import('@/app/api/request-draft/route')
    const res = await GET(req('https://x.test/api/request-draft?type=birth'))
    expect(res.status).not.toBe(403)
  })
})

describe('מייל: קליטת בקשה שנשלחה', () => {
  it('משיב בנוסח הסגירה ולא יוצר בקשה', async () => {
    const { handleEmailRequest } = await import('./emailRequestIntake')
    const handled = await handleEmailRequest(db as never, {
      fromEmail: 'family@gmail.com', subject: 'בקשת הלוואה · ת.ז 123456789',
      body: 'סכום ההלוואה המבוקש: 5000', attachments: [],
    })
    expect(handled).toBe(true)
    expect(deliverMail).toHaveBeenCalledTimes(1)
    expect(String(deliverMail.mock.calls[0][2])).toContain(MSG)
    expect(inserts).toEqual([])
  })
})
