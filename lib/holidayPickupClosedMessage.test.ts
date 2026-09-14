import { describe, it, expect } from 'vitest'
import { pickupClosedMessageKey } from './holidayPickupClosedMessage'
import { HOLIDAY_MESSAGE_META } from './yemotHolidayMessages'

describe('הודעת סגירת חלוקת הכרטיסים', () => {
  it('שער פתוח → אין הודעת סגירה', () => {
    expect(pickupClosedMessageKey({ pickupOpen: true, everStarted: false })).toBe(null)
    expect(pickupClosedMessageKey({ pickupOpen: true, everStarted: true })).toBe(null)
  })

  it('סגור ולא החל → "טרם נפתחה"', () => {
    expect(pickupClosedMessageKey({ pickupOpen: false, everStarted: false }))
      .toBe('card_pickup_closed')
  })

  // 🔴 המקרה שביקש המשתמש (14.09): סוגרים אחרי שחילקו.
  it('🔴 סגור אחרי שחולקו כרטיסים → "כבר הסתיימה"', () => {
    expect(pickupClosedMessageKey({ pickupOpen: false, everStarted: true }))
      .toBe('card_pickup_ended')
  })

  it('שתי ההודעות מוגדרות וניתנות להקלטה', () => {
    for (const key of ['card_pickup_closed', 'card_pickup_ended']) {
      const m = HOLIDAY_MESSAGE_META.find(x => x.key === key)
      expect(m, `חסרה הודעה ${key}`).toBeTruthy()
      expect(m!.allowAudio).toBe(true)
      expect(m!.defaultText.trim().length).toBeGreaterThan(0)
    }
  })

  // ⚠️ נוסח עם {משתנה} אינו ניתן להקלטה כקובץ יחיד.
  it('הנוסחים אינם מכילים משתנים', () => {
    for (const key of ['card_pickup_closed', 'card_pickup_ended']) {
      const m = HOLIDAY_MESSAGE_META.find(x => x.key === key)!
      expect(/\{[^}]+\}/.test(m.defaultText)).toBe(false)
    }
  })
})
