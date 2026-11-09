import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/cardStock', () => ({
  getStockBalance: vi.fn(async () => 10),
  consumeOneCard: vi.fn(async () => 9),
}))
vi.mock('@/lib/cardStockAlert', () => ({ maybeSendLowStockAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/nedarim', () => ({
  getNedarimCreds: vi.fn(async () => ({ mosad: 'x' })),
  findClientByZeout: vi.fn(async () => 'c1'), saveClientCard: vi.fn(),
  addTlush: vi.fn(async () => ({ ok: true, tlushId: 't1' })),
  getClientCard: vi.fn(async () => null), getMaternityLimitedId: vi.fn(async () => 1),
  isPassportId: vi.fn(() => false),
}))
vi.mock('@/lib/activityLog', () => ({ logActivity: vi.fn(async () => {}) }))
vi.mock('@/lib/sendMail', () => ({ deliverMail: vi.fn() }))
vi.mock('./scheduledMail', () => ({ scheduleCardPickupReminders: vi.fn(async () => {}) }))

import { loadMaternityCardOnApproval } from './maternityCards'
import { addTlush } from '@/lib/nedarim'

// מסד מדומה: חסם טעינה כבר תפוס (insert מחזיר 23505), התיק במצב failed בלי tlush
function admin(aidState: Record<string, unknown>) {
  const aid: Record<string, unknown> = {
    id: 'a1', beneficiary_id: 'b1', card_balance: 0, card_load_status: 'failed', card_tlush_id: null,
    card_load_error: null, birth_date: null, wants_food_card: true, ...aidState,
  }
  const ben = { id: 'b1', id_number: '1', spouse_id_number: null, nedarim_id: 'c1', email: null }
  const from = (table: string) => {
    let patch: Record<string, unknown> | null = null
    let lock = false
    let isInsert = false
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.is = () => q
    q.lt = () => q
    q.insert = () => { isInsert = true; return q }
    q.update = (p: Record<string, unknown>) => { patch = p; if (p.card_load_status === 'pending') lock = true; return q }
    q.maybeSingle = () => Promise.resolve({ data: table === 'maternity_aids' ? { ...aid } : ben })
    q.then = (res: (v: unknown) => unknown) => {
      if (table === 'maternity_load_guard' && isInsert) return Promise.resolve({ error: { code: '23505', message: 'dup' } }).then(res)
      if (table === 'maternity_aids' && patch) {
        Object.assign(aid, patch)
        if (lock) return Promise.resolve({ data: [{ id: 'a1' }] }).then(res)
      }
      return Promise.resolve({ data: null }).then(res)
    }
    return q
  }
  return { client: { from } as never, aid }
}

describe('טעינת כרטיס יולדת: חסם תפוס בלי טעינה מאושרת', () => {
  it('לא מחזיר הצלחה ולא טוען, ומשאיר את התיק failed עם שגיאה', async () => {
    const { client, aid } = admin({})
    const r = await loadMaternityCardOnApproval(client, 'a1')
    expect(r.ok).toBe(false)
    expect(r.already).toBeUndefined()
    expect(addTlush).not.toHaveBeenCalled()
    expect(aid.card_load_status).toBe('failed')
    expect(String(aid.card_load_error)).toContain('חסם')
  })

  it('תיק שכבר נטען (יש tlush) עדיין יוצא כ"כבר נטען"', async () => {
    const { client } = admin({ card_load_status: 'loaded', card_tlush_id: 't9' })
    const r = await loadMaternityCardOnApproval(client, 'a1')
    expect(r).toMatchObject({ ok: true, already: true })
  })
})
