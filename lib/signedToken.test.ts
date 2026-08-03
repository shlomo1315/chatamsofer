import { describe, it, expect, afterEach } from 'vitest'
import { signPayload, verifySignature, signingConfigured } from './signedToken'

// ⚠️ הבדיקה המרכזית כאן היא ה*כשל*: בהיעדר סוד חתימה אסור שתיווצר חתימה ואסור
// שאימות יעבור. עד כה ה-HMAC חושב עם מפתח ריק — חתימה שכל אחד יכול לחשב,
// כלומר זיוף סשן פורטל ואסימוני אימות היה טריוויאלי בסביבה בלי המשתנים.
const ENV = ['OTP_NONCE_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'] as const
const snapshot = Object.fromEntries(ENV.map(k => [k, process.env[k]]))

afterEach(() => {
  for (const k of ENV) {
    if (snapshot[k] === undefined) delete process.env[k]
    else process.env[k] = snapshot[k]
  }
})

const clearSecrets = () => { for (const k of ENV) delete process.env[k] }

describe('signedToken', () => {
  it('חותם ומאמת כשיש סוד', () => {
    clearSecrets()
    process.env.OTP_NONCE_SECRET = 'test-secret-value'
    expect(signingConfigured()).toBe(true)
    const sig = signPayload('a:b:123')
    expect(sig).toBeTruthy()
    expect(verifySignature('a:b:123', sig!)).toBe(true)
  })

  it('דוחה חתימה של מטען אחר', () => {
    clearSecrets()
    process.env.OTP_NONCE_SECRET = 'test-secret-value'
    const sig = signPayload('a:b:123')!
    expect(verifySignature('a:b:124', sig)).toBe(false)
  })

  it('נכשל-סגור: בלי סוד אין חתימה', () => {
    clearSecrets()
    expect(signingConfigured()).toBe(false)
    expect(signPayload('a:b:123')).toBeNull()
  })

  it('נכשל-סגור: בלי סוד שום אימות אינו עובר — גם לא חתימה ריקה', () => {
    clearSecrets()
    expect(verifySignature('a:b:123', '')).toBe(false)
    expect(verifySignature('a:b:123', 'anything')).toBe(false)
    // ⚠️ הווקטור האמיתי: חתימת HMAC עם מפתח ריק. אם היא עוברת — אפשר לזייף הכל.
    const forged = '0e3f9bd0b1b6f7f1b8e2a2c9d4f0a1b2c3d4e5f60718293a4b5c6d7e8f901234'
    expect(verifySignature('a:b:123', forged)).toBe(false)
  })

  it('נופל-לאחור למפתח ה-service-role כשאין OTP_NONCE_SECRET', () => {
    clearSecrets()
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-fallback'
    expect(signingConfigured()).toBe(true)
    const sig = signPayload('x:y:1')
    expect(sig).toBeTruthy()
    expect(verifySignature('x:y:1', sig!)).toBe(true)
  })

  it('חתימה בקידוד שונה אינה מתקבלת בקידוד השני', () => {
    clearSecrets()
    process.env.OTP_NONCE_SECRET = 'test-secret-value'
    const hex = signPayload('p:1', 'hex')!
    expect(verifySignature('p:1', hex, 'base64url')).toBe(false)
  })
})
