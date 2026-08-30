import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { verifyCronSecret } from './apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 אימות הסוד של משימות ה-cron.
//
// הבאג שזה תופס: התיעוד בכל ה-cron אומר `?token=`, וכך הוגדרו השירותים
// ב-Railway — אבל הקוד קרא `?secret=` בלבד. כל הרצה דרך פרמטר בכתובת
// נדחתה ב-401, והכשל שקט: ל-cron אין מי שיקרא את תשובתו, ולכן משימה
// שלא רצה מעולם נראית בדיוק כמו משימה שהצליחה.
// ─────────────────────────────────────────────────────────────────────────────

const SECRET = 'super-secret-value-123'
const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers })

beforeEach(() => { process.env.CRON_SECRET = SECRET })
afterEach(() => { delete process.env.CRON_SECRET })

describe('verifyCronSecret — שמות הפרמטר', () => {
  it('מקבל ?token= (השם שבתיעוד ובהגדרת Railway)', () => {
    expect(verifyCronSecret(req(`https://x.dev/api/cron/x?token=${SECRET}`))).toBe(true)
  })

  it('מקבל ?secret= (תאימות לאחור)', () => {
    expect(verifyCronSecret(req(`https://x.dev/api/cron/x?secret=${SECRET}`))).toBe(true)
  })

  it('מקבל Authorization: Bearer', () => {
    expect(verifyCronSecret(req('https://x.dev/api/cron/x', { authorization: `Bearer ${SECRET}` }))).toBe(true)
  })
})

describe('verifyCronSecret — דחייה', () => {
  it('דוחה סוד שגוי', () => {
    expect(verifyCronSecret(req('https://x.dev/api/cron/x?token=wrong'))).toBe(false)
  })

  it('דוחה סוד באורך זהה אך שונה', () => {
    const same = 'x'.repeat(SECRET.length)
    expect(verifyCronSecret(req(`https://x.dev/api/cron/x?token=${same}`))).toBe(false)
  })

  it('דוחה בקשה ללא סוד כלל', () => {
    expect(verifyCronSecret(req('https://x.dev/api/cron/x'))).toBe(false)
  })

  it('דוחה פרמטר ריק', () => {
    expect(verifyCronSecret(req('https://x.dev/api/cron/x?token='))).toBe(false)
  })

  it('🔴 נכשל-סגור: בלי CRON_SECRET מוגדר — הכל נדחה', () => {
    delete process.env.CRON_SECRET
    expect(verifyCronSecret(req(`https://x.dev/api/cron/x?token=${SECRET}`))).toBe(false)
    expect(verifyCronSecret(req('https://x.dev/api/cron/x?token='))).toBe(false)
  })

  it('דוחה Bearer עם סוד שגוי', () => {
    expect(verifyCronSecret(req('https://x.dev/api/cron/x', { authorization: 'Bearer nope' }))).toBe(false)
  })
})
