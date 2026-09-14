import { describe, it, expect } from 'vitest'
import { pickupPhaseOf, pickupPhasePatch, centerPickupMessageKey } from './centerPickupPhase'

const T1 = '2026-09-14T10:00:00.000Z'
const T2 = '2026-09-14T18:00:00.000Z'

describe('שלב חלוקת הכרטיסים במוקד', () => {
  it('שורה חסרה → טרם החל', () => {
    expect(pickupPhaseOf(null)).toBe('not_started')
    expect(pickupPhaseOf(undefined)).toBe('not_started')
  })

  it('בלי חותמות → טרם החל', () => {
    expect(pickupPhaseOf({ pickup_open_at: null, pickup_ended_at: null })).toBe('not_started')
  })

  it('נפתח ולא נסגר → מחלק', () => {
    expect(pickupPhaseOf({ pickup_open_at: T1, pickup_ended_at: null })).toBe('active')
  })

  // 🔴 המקרה שביקש המשתמש (14.09).
  it('🔴 נפתח ונסגר → נסגרה החלוקה', () => {
    expect(pickupPhaseOf({ pickup_open_at: T1, pickup_ended_at: T2 })).toBe('ended')
  })

  // ⚠️ סיום גובר — אחרת סגירה נבלעת בשקט.
  it('חותמת סיום בלי פתיחה → עדיין נסגר', () => {
    expect(pickupPhaseOf({ pickup_open_at: null, pickup_ended_at: T2 })).toBe('ended')
  })

  describe('כתיבת השלב', () => {
    it('מחלק → פתיחה בלבד', () => {
      expect(pickupPhasePatch('active', T1)).toEqual({ pickup_open_at: T1, pickup_ended_at: null })
    })
    it('נסגר → שתי החותמות', () => {
      expect(pickupPhasePatch('ended', T2)).toEqual({ pickup_open_at: T2, pickup_ended_at: T2 })
    })
    it('טרם החל → מנקה הכול', () => {
      expect(pickupPhasePatch('not_started', T1)).toEqual({ pickup_open_at: null, pickup_ended_at: null })
    })
    // 🔴 הלוך ושוב חייב להיות יציב.
    it('כל שלב נקרא חזרה כפי שנכתב', () => {
      for (const p of ['not_started', 'active', 'ended'] as const) {
        expect(pickupPhaseOf(pickupPhasePatch(p, T1))).toBe(p)
      }
    })
  })

  describe('ההודעה בטלפון', () => {
    it('מחלק → אין הודעה, ממשיכים לשיוך', () => {
      expect(centerPickupMessageKey('active')).toBe(null)
    })
    it('טרם החל → "המוקד טרם החל"', () => {
      expect(centerPickupMessageKey('not_started')).toBe('card_center_not_open')
    })
    it('🔴 נסגר → "החלוקה הסתיימה"', () => {
      expect(centerPickupMessageKey('ended')).toBe('card_pickup_ended')
    })
  })
})
