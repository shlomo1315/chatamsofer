import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac, randomBytes } from 'crypto'
import type { NextRequest } from 'next/server'
import { getInboundSigningSecret, resetInboundSecretCache, verifyInboundSvix } from './resendInboundSecret'

const mkSecret = () => `whsec_${randomBytes(24).toString('base64')}`

function signed(secret: string, body: string) {
  const id = 'msg_1'
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64'))
    .update(`${id}.${ts}.${body}`).digest('base64')
  const h = new Headers({ 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` })
  return { headers: h } as unknown as NextRequest
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

describe('verifyInboundSvix', () => {
  const inbound = mkSecret()
  const events = mkSecret()
  const body = '{"type":"email.received"}'
  const resendOk = () => vi.fn(async () => json({ id: 'x', signing_secret: inbound })) as unknown as typeof fetch

  beforeEach(() => {
    resetInboundSecretCache()
    process.env.RESEND_API_KEY = 're_test'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('חתימה תקינה מול סוד המשתנה: בלי פנייה ל-Resend', async () => {
    const f = resendOk()
    expect(await verifyInboundSvix(signed(inbound, body), body, inbound, f)).toBe(true)
    expect(f).not.toHaveBeenCalled()
  })

  it('המשתנה מחזיק סוד אחר: מאמת מול הסוד שנמשך מ-Resend', async () => {
    const f = resendOk()
    expect(await verifyInboundSvix(signed(inbound, body), body, events, f)).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.resend.com/webhooks/5da64ad8-47f9-4707-917f-9a07a6df5e4d')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
  })

  it('גם כשהמשתנה חסר: מאמת מול הסוד שנמשך', async () => {
    expect(await verifyInboundSvix(signed(inbound, body), body, undefined, resendOk())).toBe(true)
  })

  it('חתימה מזויפת נכשלת גם מול הסוד שנמשך', async () => {
    expect(await verifyInboundSvix(signed(mkSecret(), body), body, events, resendOk())).toBe(false)
    expect(await verifyInboundSvix(signed(inbound, body), body + ' ', events, resendOk())).toBe(false)
  })

  it('כשל במשיכה: דחייה ושורה ביומן בלי הסוד', async () => {
    const f = vi.fn(async () => json({ message: 'boom' }, 500)) as unknown as typeof fetch
    expect(await verifyInboundSvix(signed(inbound, body), body, events, f)).toBe(false)
    const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ')
    expect(logged).toContain('משיכת סוד החתימה מ-Resend נכשלה')
    expect(logged).not.toContain(inbound)
  })

  it('בלי RESEND_API_KEY: דחייה בלי פנייה ל-Resend', async () => {
    delete process.env.RESEND_API_KEY
    const f = resendOk()
    expect(await verifyInboundSvix(signed(inbound, body), body, events, f)).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('המזהה לא נמצא: מאתר את ה-webhook לפי הכתובת', async () => {
    const f = vi.fn(async (u: string) => {
      if (u.endsWith('/webhooks')) return json({ data: [
        { id: 'ev', endpoint: 'https://chasamsofer.co.il/api/webhooks/resend-events' },
        { id: 'in2', endpoint: 'https://chasamsofer.co.il/api/webhooks/resend-inbound' },
      ] })
      if (u.endsWith('/webhooks/in2')) return json({ id: 'in2', signing_secret: inbound })
      return json({ message: 'not found' }, 404)
    }) as unknown as typeof fetch
    expect(await verifyInboundSvix(signed(inbound, body), body, events, f)).toBe(true)
  })

  it('שימוש חוזר בזיכרון: משיכה אחת גם לבקשות במקביל ולבקשות שאחריהן', async () => {
    const f = resendOk()
    const results = await Promise.all([1, 2, 3].map(() => verifyInboundSvix(signed(inbound, body), body, events, f)))
    expect(results).toEqual([true, true, true])
    expect(await getInboundSigningSecret(f)).toBe(inbound)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('גם כשל נשמר לזמן קצר: חתימות מזויפות לא מציפות את Resend', async () => {
    const f = vi.fn(async () => json({}, 500)) as unknown as typeof fetch
    await verifyInboundSvix(signed(mkSecret(), body), body, events, f)
    const calls = (f as unknown as ReturnType<typeof vi.fn>).mock.calls.length
    await verifyInboundSvix(signed(mkSecret(), body), body, events, f)
    expect(f).toHaveBeenCalledTimes(calls)
  })
})
