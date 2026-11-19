import { describe, expect, it } from 'vitest'
import { createHmac, randomBytes } from 'crypto'
import type { NextRequest } from 'next/server'
import { verifySvixSignature } from './svix'

const mkSecret = () => `whsec_${randomBytes(24).toString('base64')}`

function signed(secret: string, body: string) {
  const id = 'msg_1'
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64'))
    .update(`${id}.${ts}.${body}`).digest('base64')
  const h = new Headers({ 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` })
  return { headers: h } as unknown as NextRequest
}

describe('verifySvixSignature', () => {
  const inbound = mkSecret()
  const events = mkSecret()
  const body = '{"type":"email.received"}'

  it('מאמת עם סוד יחיד ודוחה סוד אחר', () => {
    expect(verifySvixSignature(signed(inbound, body), body, inbound)).toBe(true)
    expect(verifySvixSignature(signed(inbound, body), body, events)).toBe(false)
  })

  it('מקבל כמה סודות מופרדים ברווח או בפסיק — מספיק שאחד תואם', () => {
    expect(verifySvixSignature(signed(inbound, body), body, `${events} ${inbound}`)).toBe(true)
    expect(verifySvixSignature(signed(events, body), body, `${events},${inbound}`)).toBe(true)
    expect(verifySvixSignature(signed(mkSecret(), body), body, `${events} ${inbound}`)).toBe(false)
  })

  it('דוחה גוף ששונה אחרי החתימה', () => {
    expect(verifySvixSignature(signed(inbound, body), body + ' ', inbound)).toBe(false)
  })
})
