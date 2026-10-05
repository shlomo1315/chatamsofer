import { describe, it, expect } from 'vitest'
import { isPrivateIp, assertPublicHost } from './ssrfGuard'

describe('🔴 isPrivateIp', () => {
  it('IPv4 פנימי', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) {
      expect(isPrivateIp(ip)).toBe(true)
    }
  })
  it('🔴 IPv6 שמסתיר IPv4 פנימי', () => {
    expect(isPrivateIp('::ffff:7f00:1')).toBe(true)
    expect(isPrivateIp('[::ffff:127.0.0.1]')).toBe(true)
  })
  it('🔴 IPv6 פנימי (Railway fd00::/8, link-local, loopback)', () => {
    expect(isPrivateIp('fd12:3456::1')).toBe(true)
    expect(isPrivateIp('fe80::1')).toBe(true)
    expect(isPrivateIp('::1')).toBe(true)
  })
  it('ציבורי — מותר', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false)
    expect(isPrivateIp('2606:4700::1111')).toBe(false)
  })
  it('קלט לא תקין ⇒ חסום', () => {
    expect(isPrivateIp('not-an-ip')).toBe(true)
  })
})

describe('assertPublicHost', () => {
  it('🔴 שמות פנימיים נחסמים בלי DNS', async () => {
    expect(await assertPublicHost('localhost')).toBe(false)
    expect(await assertPublicHost('web.railway.internal')).toBe(false)
    expect(await assertPublicHost('[::ffff:7f00:1]')).toBe(false)
  })
})
