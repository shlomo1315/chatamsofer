import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMagicToken, verifyMagicToken, buildMagicLink, MAGIC_LINK_TTL_MS } from './portalMagicLink'
import { screenFromPath, pathForScreen } from './portalScreens'

describe('קישור חתום לאזור האישי', () => {
  const old = process.env.OTP_NONCE_SECRET
  beforeEach(() => { process.env.OTP_NONCE_SECRET = 'test-secret' })
  afterEach(() => { process.env.OTP_NONCE_SECRET = old })

  it('אסימון תקין מוחזר עם המוטב והמסך', () => {
    const t = createMagicToken('abc-123', 'lineage')
    expect(verifyMagicToken(t)).toEqual({ ok: true, beneficiaryId: 'abc-123', screen: 'lineage' })
  })

  it('אסימון שפג תוקפו נדחה כ-expired', () => {
    const t = createMagicToken('abc', 'requests', 1000, 0)
    expect(verifyMagicToken(t, 5000)).toEqual({ ok: false, reason: 'expired' })
    expect(verifyMagicToken(t, 500).ok).toBe(true)
  })

  it('אסימון ששונה נדחה', () => {
    const t = createMagicToken('abc', 'requests')
    const raw = Buffer.from(t, 'base64url').toString().replace('abc', 'xyz')
    expect(verifyMagicToken(Buffer.from(raw).toString('base64url'))).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyMagicToken('junk')).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyMagicToken(undefined)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('סשן רגיל של הפורטל לא עובד כקישור (תג שונה)', async () => {
    const { createPortalToken } = await import('./portalSession')
    expect(verifyMagicToken(createPortalToken('abc')).ok).toBe(false)
  })

  it('בלי סוד חתימה אין הנפקה ואין אימות', () => {
    const t = createMagicToken('abc', 'home')
    delete process.env.OTP_NONCE_SECRET
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(createMagicToken('abc', 'home')).toBe('')
    expect(verifyMagicToken(t).ok).toBe(false)
    expect(buildMagicLink('https://x.il', 'abc', 'home')).toBe('https://x.il/my')
    if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey
  })

  it('כתובת הקישור כוללת נתיב קבוע ואסימון', () => {
    const url = buildMagicLink('https://x.il', 'abc', 'new-holiday')
    expect(url.startsWith('https://x.il/my/new?type=holiday&t=')).toBe(true)
    expect(MAGIC_LINK_TTL_MS).toBe(7 * 86400000)
  })

  it('נתיבים מתורגמים למסכים', () => {
    expect(screenFromPath('/my/requests/2318')).toBe('requests')
    expect(screenFromPath('/my/lineage/add')).toBe('lineage-add')
    expect(screenFromPath('/my/new', 'holiday')).toBe('new-holiday')
    expect(screenFromPath('/my')).toBe('home')
    expect(pathForScreen('documents-upload')).toBe('/my/documents/upload')
  })
})
