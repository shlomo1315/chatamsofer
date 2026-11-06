import { describe, it, expect, vi } from 'vitest'

// 🔴 הבאג מ-5-6.11.2026: התור השעתי שלף את כל הלידות הפעילות בשאילתה אחת,
// ממוינות מהוותיקה לחדשה. השרת חותך כל תשובה ל-1000 שורות, ולכן הלידות
// החדשות (מעבר לשורה ה-1000) לא הגיעו לתור ולא נטענו, אף שהמלאי היה מלא.

vi.mock('@/lib/cardStock', () => ({
  getStockBalance: vi.fn(async () => 250),
  consumeOneCard: vi.fn(async () => 249),
}))
vi.mock('@/lib/cardStockAlert', () => ({ maybeSendLowStockAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/nedarim', () => ({
  getNedarimCreds: vi.fn(async () => null),
  findClientByZeout: vi.fn(), saveClientCard: vi.fn(), addTlush: vi.fn(),
  getClientCard: vi.fn(), getMaternityLimitedId: vi.fn(), isPassportId: vi.fn(),
}))
vi.mock('@/lib/activityLog', () => ({ logActivity: vi.fn(async () => {}) }))

import { processAwaitingStock } from './maternityCards'

const MAX_ROWS = 1000

// 1200 לידות פעילות: 1199 ותיקות שכבר נטענו, ואחת חדשה שממתינה — בסוף הרשימה.
const rows = Array.from({ length: 1200 }, (_, i) => ({
  id: `a${i}`, card_status: 'loaded', card_voucher_status: 'issued',
  card_load_status: i === 1199 ? 'idle' : 'loaded', card_tlush_id: null,
  birth_type: null, wants_food_card: true,
}))

// מסד מדומה שאוכף תקרת שורות כמו PostgREST. שליפת תיק בודד מחזירה null,
// כך שכל ניסיון טעינה נכשל ב"התיק לא נמצא" ומדווח עם מזהה התיק.
function fakeDb() {
  const from = () => {
    let range: [number, number] | null = null
    let single = false
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'update', 'or', 'insert']) q[m] = () => q
    q.range = (a: number, b: number) => { range = [a, b]; return q }
    q.maybeSingle = () => { single = true; return q }
    q.then = (res: (v: unknown) => unknown) => {
      if (single) return Promise.resolve({ data: null, error: null }).then(res)
      const [a, b] = range ?? [0, rows.length - 1]
      const data = rows.slice(a, Math.min(b + 1, a + MAX_ROWS))
      return Promise.resolve({ data, error: null }).then(res)
    }
    return q
  }
  return { from } as never
}

describe('תור הכרטיסים — שליפה מעבר ל-1000 שורות', () => {
  it('לידה ממתינה אחרי השורה ה-1000 מגיעה לתור', async () => {
    const res = await processAwaitingStock(fakeDb())
    expect(res.failed).toBe(1)
    expect(res.errors[0]).toContain('a1199')
  })
})
