import { describe, it, expect, vi, beforeEach } from 'vitest'

// מלאי מדומה: כל ניכוי מוריד כרטיס אחד
let stock = 0
vi.mock('@/lib/cardStock', () => ({
  getStockBalance: vi.fn(async () => stock),
  consumeOneCard: vi.fn(async () => (stock > 0 ? --stock : null)),
}))
vi.mock('@/lib/cardStockAlert', () => ({ maybeSendLowStockAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/nedarim', () => ({
  getNedarimCreds: vi.fn(async () => ({ mosad: 'x' })),
  findClientByZeout: vi.fn(), saveClientCard: vi.fn(), addTlush: vi.fn(),
  getClientCard: vi.fn(), getMaternityLimitedId: vi.fn(), isPassportId: vi.fn(),
}))
vi.mock('@/lib/activityLog', () => ({ logActivity: vi.fn(async () => {}) }))
vi.mock('@/lib/sendMail', () => ({ deliverMail: vi.fn() }))

import { processAwaitingStock, loadMaternityCardOnApproval } from './maternityCards'
import { maybeSendLowStockAlert } from '@/lib/cardStockAlert'

// לקוח Supabase מדומה: כל שרשור מחזיר את עצמו, והתוצאה נקבעת לפי הטבלה.
// המשפחה לא נמצאת (beneficiaries → null), כך שכל יולדת עוברת את הניכוי ואת
// נקודת ההתראה ונכשלת מיד אחריה, בלי לגעת בנדרים.
function fakeAdmin(aids: { id: string }[]) {
  const make = (table: string) => {
    let single = false
    let claim = false
    const result = () => {
      if (table === 'maternity_aids' && claim) return [{ id: 'a1' }]
      if (table === 'maternity_aids') return single ? { id: 'a1', beneficiary_id: 'b1' } : aids
      return null
    }
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'update', 'insert', 'in', 'neq', 'not'])
      q[m] = () => q
    q.or = () => { claim = true; return q }
    q.maybeSingle = () => { single = true; return q }
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: result(), error: null }).then(res)
    return q
  }
  return { from: make } as never
}

beforeEach(() => { vi.mocked(maybeSendLowStockAlert).mockClear() })

describe('התראת מלאי נמוך בחלוקה לממתינות', () => {
  it('נשלחת פעם אחת בסוף, לפי המלאי הסופי, ולא באמצע', async () => {
    stock = 5
    const aids = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}` }))
    await processAwaitingStock(fakeAdmin(aids))
    expect(maybeSendLowStockAlert).toHaveBeenCalledTimes(1)
    expect(vi.mocked(maybeSendLowStockAlert).mock.calls[0][1]).toBe(0)
  })

  it('אישור לידה בודד ממשיך לבדוק התראה מיד', async () => {
    stock = 3
    await loadMaternityCardOnApproval(fakeAdmin([]), 'a1')
    expect(maybeSendLowStockAlert).toHaveBeenCalledWith(expect.anything(), 2)
  })
})
