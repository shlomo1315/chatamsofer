import { describe, it, expect } from 'vitest'
import { canLinkMaternityCard } from './maternityCardGate'
import { MATERNITY_MESSAGE_META } from './yemotMaternityMessages'

describe('canLinkMaternityCard — שיוך כרטיס רק למי שנוכה לה כרטיס', () => {
  it('ממתינה למלאי — חסומה', () => {
    expect(canLinkMaternityCard({ card_status: 'awaiting_stock', card_load_status: 'idle', card_tlush_id: null })).toBe(false)
  })

  it('אושרה אבל לא נוכה כרטיס (pending/idle) — חסומה', () => {
    expect(canLinkMaternityCard({ card_status: 'pending', card_load_status: 'idle', card_tlush_id: null })).toBe(false)
  })

  it('הטעינה נכשלה — חסומה', () => {
    expect(canLinkMaternityCard({ card_status: 'pending', card_load_status: 'failed', card_tlush_id: null })).toBe(false)
  })

  it('הטעינה בוטלה (unloaded) — חסומה גם כשנשמר card_tlush_id', () => {
    expect(canLinkMaternityCard({ card_status: 'loaded', card_load_status: 'unloaded', card_tlush_id: 'T1' })).toBe(false)
  })

  it('awaiting_stock גובר גם אם יש card_tlush_id', () => {
    expect(canLinkMaternityCard({ card_status: 'awaiting_stock', card_load_status: 'loaded', card_tlush_id: 'T1' })).toBe(false)
  })

  it('נוכה כרטיס ונטען — מותרת', () => {
    expect(canLinkMaternityCard({ card_status: 'loaded', card_load_status: 'loaded', card_tlush_id: 'T1' })).toBe(true)
  })

  it('יש card_tlush_id בלי סטטוס טעינה — מותרת', () => {
    expect(canLinkMaternityCard({ card_status: 'loaded', card_load_status: null, card_tlush_id: 'T1' })).toBe(true)
  })

  it('יש הודעה חדשה לחסומה, בלי תווים שמשבשים את ימות', () => {
    const m = MATERNITY_MESSAGE_META.find((x) => x.key === 'card_not_allocated')
    expect(m).toBeDefined()
    expect(m!.defaultText).not.toMatch(/[.\-"'&|]/)
  })
})
