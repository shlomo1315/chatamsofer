import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הבורר שמחליט אם גובים כסף או לא.
//
// הכלל: אמיתי רק אם הוגדר *ולא* במצב בדיקה. כל שאר המצבים נופלים
// למדומה — ושם לא נגבה שקל.
//
// שני כיווני הכשל חמורים בצורה שונה:
//   · מדומה כשחשבנו שאמיתי ⇒ מוכרים בלי לגבות. מתגלה מדוח הבנק.
//   · זריקה כשהספק חסר      ⇒ החנות מחזירה 500 לכל קונה, בשיא העומס.
//
// ⚠️ ההגדרות נטענות ב-import דינמי בתוך getPaymentProvider, ולכן
// ה-mock חייב להיות על המודול ולא על ערך שנתפס.
// ─────────────────────────────────────────────────────────────────────────────

const settings = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('./settings', () => ({
  getPaymentSettings: async () => settings.value,
  savePaymentSettings: async () => true,
  PAYMENTS_KEY: 'payments_provider',
}))

// ספק נדרים מדומה — מוגדר/לא לפי דגל, בלי לגעת ברשת.
const nedarim = vi.hoisted(() => ({ configured: true }))
vi.mock('./nedarimProvider', () => ({
  NedarimPaymentProvider: class {
    readonly name = 'nedarim'
    async isConfigured() { return nedarim.configured }
    async testConnection() { return { ok: true, message: '' } }
    async createCharge() { return { ok: true } }
    async verifyCallback() { return null }
    async refund() { return { ok: true } }
  },
}))

import { getPaymentProvider, isMockPayment } from './index'

beforeEach(() => {
  settings.value = {}
  nedarim.configured = true
})

describe('🔴 בורר ספק הסליקה', () => {
  it('הגדרות ריקות → מדומה', async () => {
    expect((await getPaymentProvider()).name).toBe('mock')
  })

  it('ספק מפורש "mock" → מדומה', async () => {
    settings.value = { provider: 'mock' }
    expect((await getPaymentProvider()).name).toBe('mock')
  })

  it('נדרים מוגדר ומצב בדיקה כבוי → אמיתי', async () => {
    settings.value = { provider: 'nedarim', testMode: false }
    expect((await getPaymentProvider()).name).toBe('nedarim')
  })

  it('🔴 מצב בדיקה גובר גם כשהפרטים מלאים', async () => {
    settings.value = { provider: 'nedarim', testMode: true }
    expect((await getPaymentProvider()).name).toBe('mock')
  })

  it('🔴 ספק אמיתי שאינו מוגדר במלואו נופל למדומה ואינו זורק', async () => {
    settings.value = { provider: 'nedarim', testMode: false }
    nedarim.configured = false
    await expect(getPaymentProvider()).resolves.toBeDefined()
    expect((await getPaymentProvider()).name).toBe('mock')
  })

  it('🔴 ספק לא מוכר נופל למדומה ואינו זורק', async () => {
    settings.value = { provider: 'tranzila', testMode: false }
    expect((await getPaymentProvider()).name).toBe('mock')
  })

  it('רווחים ורישיות אינם משנים', async () => {
    settings.value = { provider: '  NeDaRiM  ', testMode: false }
    expect((await getPaymentProvider()).name).toBe('nedarim')
  })

  it('testMode חסר נחשב כבוי (לא מפיל ספק מוגדר)', async () => {
    settings.value = { provider: 'nedarim' }
    expect((await getPaymentProvider()).name).toBe('nedarim')
  })
})

describe('isMockPayment — הדגל שמניע את באנר האזהרה', () => {
  it('true כשהספק מדומה', async () => {
    settings.value = {}
    expect(await isMockPayment()).toBe(true)
  })

  it('false כשהסליקה אמיתית', async () => {
    settings.value = { provider: 'nedarim', testMode: false }
    expect(await isMockPayment()).toBe(false)
  })

  it('🔴 true כשמצב הבדיקה דולק — המסך חייב להזהיר', async () => {
    settings.value = { provider: 'nedarim', testMode: true }
    expect(await isMockPayment()).toBe(true)
  })

  it('🔴 true כשהספק אמיתי אך חסרים פרטים', async () => {
    settings.value = { provider: 'nedarim', testMode: false }
    nedarim.configured = false
    expect(await isMockPayment()).toBe(true)
  })
})
