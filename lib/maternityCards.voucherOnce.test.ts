import { describe, it, expect, vi, beforeEach } from 'vitest'

// 🔴 הבאג מ-4-5.11.2026: תיק שחוזר מהטעינה כ-already נשאר בתור, והניסיון
// החוזר השעתי שלח ליולדת מייל שובר בכל שעה. כאן מוודאים שהשובר יוצא פעם אחת.

vi.mock('@/lib/cardStock', () => ({
  getStockBalance: vi.fn(async () => 10),
  consumeOneCard: vi.fn(async () => 9),
}))
vi.mock('@/lib/cardStockAlert', () => ({ maybeSendLowStockAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/nedarim', () => ({
  getNedarimCreds: vi.fn(async () => ({ mosad: 'x' })),
  findClientByZeout: vi.fn(), saveClientCard: vi.fn(), addTlush: vi.fn(),
  getClientCard: vi.fn(), getMaternityLimitedId: vi.fn(), isPassportId: vi.fn(),
}))
vi.mock('@/lib/activityLog', () => ({ logActivity: vi.fn(async () => {}) }))
vi.mock('@/lib/sendMail', () => ({ deliverMail: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/maternityVoucher', () => ({ buildCardVoucherOnly: vi.fn(async () => undefined) }))

import { processAwaitingStock } from './maternityCards'
import { deliverMail } from '@/lib/sendMail'

type Row = Record<string, unknown>

// מסד מדומה עם תיק אחד ששומר מצב בין הריצות. הטעינה תמיד מחזירה already:
// תפיסת הטעינה (or על card_load_status) נכשלת — כמו תיק שהחסם שלו תפוס.
function fakeDb(row: Row) {
  const from = (table: string) => {
    let patch: Row | null = null
    let orStr = ''
    let single = false
    const run = () => {
      if (table !== 'maternity_aids') return null
      if (patch) {
        if (orStr.includes('card_load_status')) return []
        if (orStr) {
          const free = row.card_status !== 'loaded' || row.card_voucher_status !== 'issued'
          if (!free) return []
        }
        Object.assign(row, patch)
        return [{ id: row.id }]
      }
      if (single) return { ...row, beneficiary: { full_name: 'כהן', email: 'm@example.com' } }
      return [{ ...row }]
    }
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'in', 'neq', 'not', 'is', 'insert', 'range']) q[m] = () => q
    q.update = (p: Row) => { patch = p; return q }
    q.or = (s: string) => { orStr = s; return q }
    q.maybeSingle = () => { single = true; return q }
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(res)
    return q
  }
  return { from } as never
}

const stuckAid = (): Row => ({
  id: 'a1', status: 'active', card_status: 'awaiting_stock', card_voucher_status: 'issued',
  card_load_status: 'failed', card_tlush_id: null, wants_food_card: true,
})

beforeEach(() => {
  vi.mocked(deliverMail).mockReset()
  vi.mocked(deliverMail).mockResolvedValue({ ok: true } as never)
})

describe('שובר כרטיס בניסיון החוזר — פעם אחת בלבד', () => {
  it('ריצה שנייה על אותו תיק לא שולחת מייל ולא נספרת', async () => {
    const db = fakeDb(stuckAid())
    const first = await processAwaitingStock(db)
    expect(first.processed).toBe(1)
    expect(deliverMail).toHaveBeenCalledTimes(1)

    for (let hour = 0; hour < 5; hour++) {
      const next = await processAwaitingStock(db)
      expect(next.processed).toBe(0)
      expect(next.failed).toBe(0)
    }
    expect(deliverMail).toHaveBeenCalledTimes(1)
  })

  it('שתי ריצות מקבילות שולחות מייל אחד', async () => {
    const db = fakeDb(stuckAid())
    await Promise.all([processAwaitingStock(db), processAwaitingStock(db)])
    expect(deliverMail).toHaveBeenCalledTimes(1)
  })

  it('כשל בשליחה מחזיר את הסימון, והריצה הבאה מנסה שוב', async () => {
    const row = stuckAid()
    const db = fakeDb(row)
    vi.mocked(deliverMail).mockResolvedValueOnce({ ok: false, error: 'smtp' } as never)
    const first = await processAwaitingStock(db)
    expect(first.failed).toBe(1)
    expect(row.card_status).toBe('awaiting_stock')

    const second = await processAwaitingStock(db)
    expect(second.processed).toBe(1)
    expect(deliverMail).toHaveBeenCalledTimes(2)
  })
})
