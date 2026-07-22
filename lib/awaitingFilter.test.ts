import { describe, it, expect } from 'vitest'

// ⚠️ הסינון הזה מופיע בשני מקומות שחייבים להישאר זהים:
//   lib/maternityCards.ts        → processAwaitingStock (מי מקבלת כרטיס)
//   app/api/admin/card-stock/route.ts → מונה "יולדות הממתינות למלאי"
// כשהם נפרדו, המסך הציג 0 בזמן שיולדת אמיתית המתינה — ולהפך.
type Aid = {
  card_status?: string | null
  card_voucher_status?: string | null
  card_load_status?: string | null
  card_tlush_id?: string | null
  birth_type?: string | null
}

const isWaiting = (a: Aid) =>
  a.card_load_status !== 'loaded' && !a.card_tlush_id &&
  a.card_status !== 'rejected' &&
  a.birth_type !== 'silent'

describe('מי ממתינה לכרטיס מזון', () => {
  it('יולדת שנתקעה ב-pending נספרת', () => {
    // המקרה שקרה בפועל: אושרה, אך card_status נשאר pending ולא
    // awaiting_stock — ולכן לא נכנסה לתור ולא קיבלה כרטיס ולא שובר.
    expect(isWaiting({ card_status: 'pending', card_load_status: 'idle' })).toBe(true)
  })

  it('גם awaiting_stock ו-approved נספרות', () => {
    expect(isWaiting({ card_status: 'awaiting_stock', card_load_status: 'idle' })).toBe(true)
    expect(isWaiting({ card_status: 'approved', card_load_status: 'idle' })).toBe(true)
    expect(isWaiting({ card_voucher_status: 'awaiting_stock', card_load_status: 'idle' })).toBe(true)
  })

  it('מי שכבר נטענה אינה נספרת', () => {
    expect(isWaiting({ card_status: 'loaded', card_load_status: 'loaded' })).toBe(false)
    expect(isWaiting({ card_status: 'pending', card_tlush_id: 'T123' })).toBe(false)
  })

  it('לידה שקטה ונדחית אינן נספרות', () => {
    expect(isWaiting({ card_status: 'pending', birth_type: 'silent' })).toBe(false)
    expect(isWaiting({ card_status: 'rejected' })).toBe(false)
  })
})
