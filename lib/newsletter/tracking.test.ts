import { describe, it, expect, vi, beforeEach } from 'vitest'

// מסד מדומה: נמעני קמפיין ואירועים, מספיק בשביל recordNewsletterEvent
type Row = Record<string, unknown>
const db = {
  recipients: new Map<string, Row>(),
  events: [] as Row[],
  rpcError: { message: 'function newsletter_track does not exist' } as { message: string } | null,
  rpc: vi.fn(),
  from(table: string) {
    return {
      select: () => ({
        eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: table === 'campaign_recipients' ? db.recipients.get(v) ?? null : null }) }),
      }),
      insert: async (row: Row) => { db.events.push({ ...row, created_at: new Date().toISOString() }); return { error: null } },
      update: (patch: Row) => ({ eq: async (_c: string, v: string) => { Object.assign(db.recipients.get(v)!, patch); return { error: null } } }),
    }
  },
}
db.rpc.mockImplementation(async () => ({ error: db.rpcError }))

vi.mock('@/lib/apiAuth', () => ({ getServiceClient: () => db }))

process.env.OTP_NONCE_SECRET = 'test-secret'

const { addTracking, clickUrl, verifyClick, signClick, parseUserAgent, machineReason, openPixelUrl } = await import('./tracking')
const { recordNewsletterEvent } = await import('./trackEvent')
const { buildCampaignReport } = await import('./report')
const openRoute = await import('@/app/api/newsletter/o/[id]/route')
const clickRoute = await import('@/app/api/newsletter/c/[id]/route')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const APPLE_MPP = 'Mozilla/5.0'
const SCANNER = 'Mozilla/5.0 (compatible; Mimecast URL scanner)'
const L1 = 'https://chasamsofer.co.il/donate?x=1&y=2'
const L2 = 'https://example.com/article'

const recipient = (id: string, email: string): Row => ({
  id, email, status: 'sent', resend_id: 're_' + id.slice(0, 4), sent_at: new Date(Date.now() - 3600_000).toISOString(),
  delivered_at: null, opened_at: null, clicked_at: null, open_count: 0, click_count: 0,
  bounced_at: null, complained_at: null, error: null, merge_data: { 'שם_מלא': email },
})

const open = (id: string, ua: string, method = 'GET') => {
  const req = new Request(`https://chasamsofer.co.il/api/newsletter/o/${id}.gif`, { method, headers: { 'user-agent': ua } })
  return (method === 'HEAD' ? openRoute.HEAD() : openRoute.GET(req, { params: Promise.resolve({ id: `${id}.gif` }) }))
}
const click = (id: string, url: string, ua: string, method = 'GET', href = clickUrl(id, url)) => {
  const req = new Request(href, { method, headers: { 'user-agent': ua } })
  const ctx = { params: Promise.resolve({ id }) }
  return method === 'HEAD' ? clickRoute.HEAD(req, ctx) : clickRoute.GET(req, ctx)
}

describe('קישורי מעקב וחתימה', () => {
  it('חתימה מאומתת רק לאותו נמען ואותה כתובת', () => {
    const s = signClick(A, L1)
    expect(verifyClick(A, L1, s)).toBe(true)
    expect(verifyClick(B, L1, s)).toBe(false)
    expect(verifyClick(A, 'https://evil.example', s)).toBe(false)
    expect(verifyClick(A, L1, 'zz')).toBe(false)
  })

  it('עוטף קישורי http, לא נוגע ב-mailto ובהסרה, ומוסיף פיקסל לפני </body>', () => {
    const html = `<body><a href="${L1.replace('&', '&amp;')}">תרומה</a><a href="mailto:a@b.c">מייל</a>`
      + `<a href="https://chasamsofer.co.il/api/unsubscribe/tok">הסרה</a><a href='#top'>למעלה</a></body>`
    const out = addTracking(html, A)
    expect(out).toContain(`href="${clickUrl(A, L1).replace(/&/g, '&amp;')}"`)
    expect(out).toContain('href="mailto:a@b.c"')
    expect(out).toContain('href="https://chasamsofer.co.il/api/unsubscribe/tok"')
    expect(out).toContain(`href='#top'`)
    expect(out).toMatch(new RegExp(`<img src="${openPixelUrl(A).replace(/[.?]/g, '\\$&')}"[^>]*/></body>$`))
    // עטיפה כפולה לא קורית
    expect(addTracking(out, A).match(/api\/newsletter\/c\//g)).toHaveLength(1)
  })

  it('מזהה מכשיר, תוכנת מייל ומכונות', () => {
    expect(parseUserAgent(IPHONE)).toEqual({ device: 'נייד', client: 'Apple Mail', os: 'iOS' })
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Microsoft Outlook 16.0')).toEqual({ device: 'מחשב', client: 'Outlook', os: 'Windows' })
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 5.1) GoogleImageProxy').client).toBe('Gmail')
    expect(machineReason({ ua: APPLE_MPP, kind: 'open' })).toBe('apple')
    expect(machineReason({ ua: SCANNER, kind: 'click' })).toBe('scanner')
    expect(machineReason({ ua: IPHONE, kind: 'open', method: 'HEAD' })).toBe('scanner')
    expect(machineReason({ ua: IPHONE, kind: 'click', secondsSinceSent: 3 })).toBe('fast')
    expect(machineReason({ ua: IPHONE, kind: 'click', secondsSinceSent: 600 })).toBeNull()
    expect(machineReason({ ua: 'Mozilla/5.0 (Windows NT 5.1) GoogleImageProxy', kind: 'open' })).toBeNull()
  })
})

describe('מעקב מקצה לקצה: פיקסל, קליק ודוח', () => {
  beforeEach(() => {
    db.recipients.clear(); db.events.length = 0; db.rpc.mockClear()
    db.rpcError = { message: 'function newsletter_track does not exist' }
    for (const [id, email] of [[A, 'a@x.co'], [B, 'b@x.co'], [C, 'c@x.co']]) db.recipients.set(id, recipient(id, email))
  })

  it('פתיחות וקליקים נספרים נכון, כולל כפולים, Apple ו סורקים', async () => {
    // נמען A: פתח פעמיים מהאייפון, Apple טען מראש, הקליק 3 פעמים, וסורק בדק קישור
    const pixel = await open(A, IPHONE)
    expect(pixel.headers.get('content-type')).toBe('image/gif')
    await open(A, IPHONE)
    await open(A, APPLE_MPP)
    await open(A, IPHONE, 'HEAD')
    const r1 = await click(A, L1, IPHONE)
    expect(r1.status).toBe(302)
    expect(r1.headers.get('location')).toBe(new URL(L1).toString())
    await click(A, L1, IPHONE)
    await click(A, L2, IPHONE)
    await click(A, L1, SCANNER)
    await click(A, L2, IPHONE, 'HEAD')
    // נמען B: רק Apple Mail Privacy, לא פתח באמת
    await open(B, APPLE_MPP)
    // נמען C: קישור מזויף להפניה לאתר זר — לא נרשם ולא מפנה לשם
    const evil = await click(C, 'https://evil.example', IPHONE, 'GET', `https://chasamsofer.co.il/api/newsletter/c/${C}?u=${encodeURIComponent('https://evil.example')}&s=${signClick(C, L1)}`)
    expect(evil.headers.get('location')).not.toContain('evil.example')

    const a = db.recipients.get(A)!
    expect(a.open_count).toBe(2)
    expect(a.click_count).toBe(3)
    expect(a.opened_at).toBeTruthy()
    expect(db.recipients.get(B)!.opened_at).toBeNull()
    expect(db.recipients.get(C)!.click_count).toBe(0)

    const report = buildCampaignReport([...db.recipients.values()] as never, db.events as never, new Set(['c@x.co']))
    const m = report.metrics
    expect(m).toMatchObject({ sent: 3, opened: 1, openTotal: 2, clicked: 1, clickTotal: 3, machineOpens: 2, machineClicks: 1, unsubscribed: 1 })
    expect(m.openRate).toBe(33.3)
    expect(m.clickToOpen).toBe(100)
    expect(report.links).toEqual([
      { url: L1, unique: 1, total: 2, machine: 1, pctOfSent: 33.3 },
      { url: L2, unique: 1, total: 1, machine: 0, pctOfSent: 33.3 },
    ])
    const ra = report.recipients.find(r => r.id === A)!
    expect(ra).toMatchObject({ openCount: 2, clickCount: 3, device: 'נייד', client: 'Apple Mail', os: 'iOS', links: [L1, L2] })
    expect(report.devices).toEqual([{ label: 'נייד', count: 1 }])
    expect(report.withDeviceInfo).toBe(1)
    expect(report.byHour.reduce((s, h) => s + h.opened, 0)).toBe(1)
    expect(report.byWeekday.reduce((s, d) => s + d.clicked, 0)).toBe(1)
  })

  it('כשה-RPC קיים במסד, הרישום עובר דרכו עם המכשיר וסימון המכונה', async () => {
    db.rpcError = null
    await open(A, IPHONE)
    await open(A, APPLE_MPP)
    expect(db.rpc).toHaveBeenCalledTimes(2)
    expect(db.rpc.mock.calls[0]).toEqual(['newsletter_track', expect.objectContaining({
      p_recipient: A, p_kind: 'open', p_device: 'נייד', p_client: 'Apple Mail', p_os: 'iOS', p_machine: false, p_source: 'own',
    })])
    expect(db.rpc.mock.calls[1][1]).toMatchObject({ p_machine: true, p_reason: 'apple' })
    expect(db.events).toHaveLength(0)
  })

  it('נמען לא קיים או מזהה לא תקין: הפיקסל עדיין מוחזר ולא נרשם כלום', async () => {
    expect(await recordNewsletterEvent(db as never, { recipientId: '44444444-4444-4444-8444-444444444444', kind: 'open', source: 'own' })).toBeNull()
    const res = await openRoute.GET(new Request('https://x/api/newsletter/o/abc.gif'), { params: Promise.resolve({ id: 'abc.gif' }) })
    expect(res.headers.get('content-type')).toBe('image/gif')
    expect(db.events).toHaveLength(0)
  })
})
