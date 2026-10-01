import { describe, it, expect, beforeAll } from 'vitest'
import {
  hashSellerPassword, sellerPasswordMatches,
  makeSellerToken, readSellerToken, SELLER_TTL_MS,
} from './bookFairSeller'

// ⚠️ חתימה דורשת סוד בסביבה. בלעדיו כל הפונקציות מחזירות null
// (נכשל-סגור) — ראו lib/signedToken.
beforeAll(() => {
  process.env.OTP_NONCE_SECRET ||= 'test-secret-for-seller-tokens'
})

describe('סיסמת המוכרים', () => {
  it('סיסמה נכונה מתאימה לגיבוב', () => {
    const h = hashSellerPassword('yarid2026')!
    expect(h).toBeTruthy()
    expect(sellerPasswordMatches('yarid2026', h)).toBe(true)
  })

  it('🔴 סיסמה שגויה נדחית', () => {
    const h = hashSellerPassword('yarid2026')!
    expect(sellerPasswordMatches('yarid2025', h)).toBe(false)
    expect(sellerPasswordMatches('', h)).toBe(false)
  })

  // ⚠️ הגיבוב אינו הסיסמה: מי שקורא את app_settings לא אמור לדעת אותה.
  it('⚠️ הגיבוב אינו מכיל את הסיסמה', () => {
    const h = hashSellerPassword('yarid2026')!
    expect(h).not.toContain('yarid2026')
  })

  it('רווחים מסביב אינם משנים', () => {
    const h = hashSellerPassword('  yarid2026  ')!
    expect(sellerPasswordMatches('yarid2026', h)).toBe(true)
  })

  it('סיסמה ריקה אינה ניתנת לגיבוב', () => {
    expect(hashSellerPassword('   ')).toBeNull()
  })
})

describe('🔴 אסימון סשן המוכר', () => {
  it('אסימון תקף מחזיר את שם המוכר', () => {
    const t = makeSellerToken('יוסי כהן')!
    expect(readSellerToken(t)?.name).toBe('יוסי כהן')
  })

  // 🔴 הלב: תפוגה שנשענת רק על הקוקי אינה תפוגה.
  it('🔴 אסימון שפג נדחה', () => {
    const past = Date.now() - SELLER_TTL_MS - 1000
    const t = makeSellerToken('יוסי', past)!
    expect(readSellerToken(t)).toBeNull()
  })

  it('אסימון מזויף נדחה', () => {
    const t = makeSellerToken('יוסי')!
    const tampered = t.replace(/:[0-9a-f]+$/, ':deadbeef')
    expect(readSellerToken(tampered)).toBeNull()
  })

  // 🔴 שינוי התפוגה חייב לשבור את החתימה — אחרת אפשר להאריך סשן לנצח.
  it('🔴 הארכת התפוגה שוברת את החתימה', () => {
    const t = makeSellerToken('יוסי')!
    const parts = t.split(':')
    const forged = [String(Date.now() + 10 * SELLER_TTL_MS), ...parts.slice(1)].join(':')
    expect(readSellerToken(forged)).toBeNull()
  })

  it('קלט פגום אינו מפיל', () => {
    expect(readSellerToken('')).toBeNull()
    expect(readSellerToken(null)).toBeNull()
    expect(readSellerToken('abc')).toBeNull()
    expect(readSellerToken('a:b:c')).toBeNull()
  })

  // ⚠️ ':' הוא המפריד — שם שמכיל אותו היה שובר את הפירוק.
  it('⚠️ שם עם נקודתיים מנוקה ואינו שובר את הפירוק', () => {
    const t = makeSellerToken('יוסי:כהן|x')!
    const read = readSellerToken(t)
    expect(read).not.toBeNull()
    expect(read!.name).not.toContain(':')
  })

  it('שם ארוך נחתך ואינו נדחה', () => {
    const t = makeSellerToken('א'.repeat(200))!
    expect(readSellerToken(t)).not.toBeNull()
  })
})
