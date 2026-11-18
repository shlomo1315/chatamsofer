import { beforeEach, describe, expect, it, vi } from 'vitest'

// עריכת גיליון בכל שלב: הנושא (וגוף המייל) נשמרים בטיוטה, במתוזמן ובנשלח,
// נחסמים רק בזמן שליחה, ומייל הניסיון משתמש בערך שנשמר.
const ID = '3c3916f2-4a39-41c8-9c93-b1b904b754d3'
type Row = Record<string, unknown>
let issue: Row

// שרשרת "ריקה" לכל טבלה אחרת: כל קריאה מחזירה שרשרת, ובסוף {data:null}
const empty = (): unknown => new Proxy(() => {}, {
  get: (_t, k) => (k === 'then' ? (res: (v: unknown) => void) => res({ data: null, error: null }) : k === 'maybeSingle' || k === 'single' ? async () => ({ data: null, error: null }) : empty()),
  apply: () => empty(),
})

function issuesTable() {
  let op: 'select' | 'update' = 'select'
  let payload: Row = {}
  let notStatus: unknown
  const q = {
    select: () => q,
    update: (v: Row) => { op = 'update'; payload = v; return q },
    eq: () => q,
    neq: (_k: string, v: unknown) => { notStatus = v; return q },
    maybeSingle: async () => {
      if (op === 'update') {
        if (issue.status === notStatus) return { data: null, error: null }
        Object.assign(issue, payload)
        return { data: { id: ID }, error: null }
      }
      return { data: issue, error: null }
    },
  }
  return q
}

const db = {
  from: (t: string) => (t === 'gilyonot_issues' ? issuesTable() : empty()),
  storage: { from: () => ({ download: async () => ({ data: new Blob([new Uint8Array(5)]), error: null }) }) },
}

vi.mock('@/lib/apiAuth', () => ({
  requirePermission: async () => ({ userId: 'u1', email: 'me@x.co' }),
  forbidden: () => new Response(null, { status: 403 }),
  serverMisconfigured: () => new Response(null, { status: 500 }),
  getServiceClient: () => db,
}))
vi.mock('@/lib/activityLog', () => ({ logActivity: async () => {} }))
const send = vi.fn(async () => ({ error: null }))
vi.mock('resend', () => ({ Resend: class { emails = { send } } }))

const { PATCH } = await import('@/app/api/admin/gilyonot/issues/[id]/route')
const { sendGilyonTest, loadIssue } = await import('@/lib/gilyonotSender')

const OLD = 'גיליון היכל החתם סופר · פרשת תולדות'
const NEW = 'גיליון החתם סופר · פרשת ויצא תשפ״ז'
const patch = (body: unknown) => PATCH(
  new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  { params: Promise.resolve({ id: ID }) },
)

describe('עריכת נושא וגוף המייל בכל מצב של הגיליון', () => {
  beforeEach(() => {
    send.mockClear()
    process.env.RESEND_API_KEY = 'k'
    issue = { id: ID, title: 'גיליון', parasha: 'תולדות', subject: OLD, intro: null, body_html: '<p>ישן</p>', design: null, file_path: 'a/b.pdf', file_name: 'b.pdf', file2_path: null, status: 'draft' }
  })

  for (const status of ['draft', 'scheduled', 'sent'] as const) {
    it(`בסטטוס ${status}: הנושא והתוכן נשמרים, והניסיון שולח את הערך החדש`, async () => {
      issue.status = status
      const res = await patch({ subject: NEW, body_html: '<p>חדש</p>' })
      expect(res.status).toBe(200)
      expect(issue.subject).toBe(NEW)
      expect(issue.status).toBe(status)

      const fresh = (await loadIssue(db as never, ID))!
      expect((await sendGilyonTest(db as never, fresh, 'a@b.co')).ok).toBe(true)
      const arg = (send.mock.calls[0] as unknown as [{ subject: string; html: string }])[0]
      expect(arg.subject).toBe(`[ניסיון] ${NEW}`)
      expect(arg.html).toContain('חדש')
      expect(arg.html).not.toContain('ישן')
    })
  }

  it('בזמן שליחה: נחסם (409) והנושא לא משתנה', async () => {
    issue.status = 'sending'
    const res = await patch({ subject: NEW })
    expect(res.status).toBe(409)
    expect(issue.subject).toBe(OLD)
  })

  it('שינוי סטטוס ל"בשליחה" בין הקריאה לכתיבה לא דורס את הגיליון', async () => {
    // הסטטוס נקרא כ-sent, אבל עד הכתיבה הפך ל-sending
    const real = issue
    const flipped = new Proxy(real, { get: (t, k) => { if (k === 'status') { const s = t.status; t.status = 'sending'; return s } return t[k as string] } })
    issue = flipped
    const res = await patch({ subject: NEW })
    expect(res.status).toBe(409)
    expect(real.subject).toBe(OLD)
  })
})
