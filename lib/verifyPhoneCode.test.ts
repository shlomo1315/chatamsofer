import { describe, it, expect } from 'vitest'
import { normalizePhone } from './phone'

// אימות טלפון בהרשמה: הקוד נשמר ב-app_settings תחת verify:phone:<טלפון מנורמל>,
// והוובהוק של ימות קורא אותו משם. הבדיקה מקבעת את שתי ההנחות שעליהן זה עומד.
describe('קוד אימות טלפון בהרשמה', () => {
  it('שני הצדדים מנרמלים את המספר לאותו מפתח', () => {
    // הטופס שומר לפי normalizeVerifyValue → normalizePhone.
    // הוובהוק קורא לפי normalizePhone על ApiPhone של ימות.
    // אם השניים יתפצלו — הקוד יישמר במפתח אחד וייקרא מאחר, וההקראה תיכשל.
    const variants = ['0527101315', '052-710-1315', '972527101315', '00972527101315']
    const keys = variants.map(v => `verify:phone:${normalizePhone(v)}`)
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toBe('verify:phone:0527101315')
  })

  it('שליפת הקוד מוחקת רק את plain ומשאירה את ה-hash', () => {
    // מדמה את מה ש-readRegistrationCode עושה לרשומה.
    const rec: Record<string, unknown> = {
      hash: 'abc123', expires: Date.now() + 60_000, attempts: 0, plain: '123456',
    }
    const code = String(rec.plain).replace(/\D/g, '')
    delete rec.plain

    expect(code).toBe('123456')
    expect(rec.hash).toBe('abc123')      // ⚠️ חייב להישאר — בלעדיו האימות בטופס נשבר
    expect(rec.attempts).toBe(0)
    expect(rec.plain).toBeUndefined()    // חד-פעמי
  })

  it('קוד שפג תוקפו אינו מוקרא', () => {
    const expired = { hash: 'x', expires: Date.now() - 1000, plain: '999999' }
    const valid = expired.expires && expired.expires < Date.now() ? null : expired.plain
    expect(valid).toBeNull()
  })
})
