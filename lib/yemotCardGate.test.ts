import { describe, it, expect } from 'vitest'
import { HOLIDAY_MESSAGE_META } from './yemotHolidayMessages'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מקש 2 ביקש מספר כרטיס בזמן שהחלוקה טרם התחילה.
//
// המשפחה אושרה, בחרה מוקד, וכל שלושת השערים הקיימים (רשום/מאושר/מוקד)
// נפתחו — אבל האיסוף במוקדים היה סגור (pickup_open=false) ולא חולק ולו
// כרטיס אחד. המתקשר נשלח לחפש בבית מספר שאינו קיים.
// ─────────────────────────────────────────────────────────────────────────────

/** שרשרת השערים של מקש 2, לפי הסדר שבו הן נבדקות בקוד. */
function cardGate(o: {
  pickupOpen: boolean
  registered?: boolean
  approved?: boolean
  hasCenter?: boolean
  hasCard?: boolean
}): string {
  // ⚠️ קודם כל — האם החלוקה התחילה. אינו תלוי בזיהוי המשפחה.
  if (!o.pickupOpen) return 'card_pickup_closed'
  if (!o.registered) return 'not_found'
  if (!o.approved) return 'pending_approval'
  if (!o.hasCenter) return 'card_no_center'
  if (o.hasCard) return 'card_already'
  return 'card_ask'
}

const ready = { pickupOpen: true, registered: true, approved: true, hasCenter: true, hasCard: false }

describe('🔴 שער האיסוף — מצב תשרי בפועל', () => {
  it('מאושר עם מוקד אך האיסוף סגור — לא מבקש כרטיס', () => {
    expect(cardGate({ ...ready, pickupOpen: false })).toBe('card_pickup_closed')
  })

  it('האיסוף סגור גובר גם על "לא רשום" — לא מבקש ת"ז לחינם', () => {
    expect(cardGate({ pickupOpen: false, registered: false })).toBe('card_pickup_closed')
  })

  it('האיסוף פתוח ומוכן — מבקש את מספר הכרטיס', () => {
    expect(cardGate(ready)).toBe('card_ask')
  })
})

describe('שאר השערים לא נפגעו', () => {
  it('לא רשום', () => {
    expect(cardGate({ ...ready, registered: false })).toBe('not_found')
  })
  it('ממתין לאישור', () => {
    expect(cardGate({ ...ready, approved: false })).toBe('pending_approval')
  })
  it('בלי מוקד', () => {
    expect(cardGate({ ...ready, hasCenter: false })).toBe('card_no_center')
  })
  it('כרטיס כבר חובר', () => {
    expect(cardGate({ ...ready, hasCard: true })).toBe('card_already')
  })
})

describe('ההודעה קיימת וניתנת להקלטה', () => {
  it('card_pickup_closed מוגדרת עם נוסח ברירת מחדל', () => {
    const m = HOLIDAY_MESSAGE_META.find(x => x.key === 'card_pickup_closed')
    expect(m).toBeDefined()
    expect(m!.defaultText.length).toBeGreaterThan(10)
    expect(m!.allowAudio).toBe(true)
  })
})
