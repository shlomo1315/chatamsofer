import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/cardStock', () => ({
  getStockBalance: vi.fn(async () => 10),
  consumeOneCard: vi.fn(async () => 9),
}))
vi.mock('@/lib/cardStockAlert', () => ({ maybeSendLowStockAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/nedarim', () => ({
  getNedarimCreds: vi.fn(async () => ({ mosad: 'x' })),
  findClientByZeout: vi.fn(async () => 'c1'), saveClientCard: vi.fn(),
  addTlush: vi.fn(async () => { await new Promise(r => setTimeout(r, 20)); return { ok: true, tlushId: 't1' } }),
  getClientCard: vi.fn(async () => null), getMaternityLimitedId: vi.fn(async () => 1),
  isPassportId: vi.fn(() => false),
}))
vi.mock('@/lib/activityLog', () => ({ logActivity: vi.fn(async () => {}) }))
vi.mock('@/lib/sendMail', () => ({ deliverMail: vi.fn() }))
vi.mock('./scheduledMail', () => ({ scheduleCardPickupReminders: vi.fn(async () => {}) }))

import { loadMaternityCardOnApproval } from './maternityCards'
import { addTlush } from '@/lib/nedarim'

// מסד מדומה עם מצב משותף: ה-UPDATE עם or() הוא נעילה אטומית (סינכרוני, כמו ב-SQL)
function statefulAdmin() {
  const aid: Record<string, unknown> = {
    id: 'a1', beneficiary_id: 'b1', card_balance: 0, card_load_status: null, card_tlush_id: null,
    birth_date: null, wants_food_card: true,
  }
  const ben = { id: 'b1', id_number: '1', spouse_id_number: null, nedarim_id: 'c1', email: null }
  const from = (table: string) => {
    let patch: Record<string, unknown> | null = null
    let lock = false
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.insert = () => q
    q.update = (p: Record<string, unknown>) => { patch = p; return q }
    q.or = () => { lock = true; return q }
    q.maybeSingle = () => Promise.resolve({ data: table === 'maternity_aids' ? { ...aid } : ben })
    q.then = (res: (v: unknown) => unknown) => {
      if (table === 'maternity_aids' && patch) {
        if (lock) {
          const st = aid.card_load_status
          if (st === null || ['idle', 'failed', 'unloaded'].includes(st as string)) {
            Object.assign(aid, patch)
            return Promise.resolve({ data: [{ id: 'a1' }] }).then(res)
          }
          return Promise.resolve({ data: [] }).then(res)
        }
        Object.assign(aid, patch)
      }
      return Promise.resolve({ data: null }).then(res)
    }
    return q
  }
  return { from } as never
}

describe('טעינת כרטיס יולדת: נעילה אטומית', () => {
  it('שתי קריאות מקבילות לאותה לידה טוענות פעם אחת בלבד', async () => {
    const admin = statefulAdmin()
    const [r1, r2] = await Promise.all([
      loadMaternityCardOnApproval(admin, 'a1'),
      loadMaternityCardOnApproval(admin, 'a1'),
    ])
    expect(vi.mocked(addTlush)).toHaveBeenCalledTimes(1)
    expect([r1.already, r2.already].filter(Boolean)).toHaveLength(1)
  })
})
