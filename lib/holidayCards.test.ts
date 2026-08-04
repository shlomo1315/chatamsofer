import { describe, it, expect } from 'vitest'
import { decideCardEligibility, type HolidayRecipient } from './holidayCards'
import type { ActiveDistribution } from './holidayDistributions'

// ⚠️ זו הבדיקה שמגנה על כסף: שיוך כרטיס למשפחה שלא אושרה נותן לה יתרה שלא
// אושרה. לכן כל מסלול סירוב נבדק בנפרד, ולא רק המסלול המאושר.

const dist: ActiveDistribution = {
  id: 'd1', name: 'פסח', year: 'תשפ״ו', amount_per_family: 500, registration_open: true,
}

const rec = (over: Partial<HolidayRecipient> = {}): HolidayRecipient => ({
  id: 'r1', distribution_id: 'd1', beneficiary_id: 'b1',
  approval_status: 'approved', card_number: null, card_linked_at: null, card_link_error: null,
  ...over,
})

describe('decideCardEligibility', () => {
  it('מאשר משפחה מאושרת שטרם שייכה כרטיס', () => {
    const r = decideCardEligibility(dist, rec())
    expect(r.allowed).toBe(true)
  })

  it('חוסם כשאין חלוקה פתוחה (כולל סגירת מתג-האב של המחלקה)', () => {
    const r = decideCardEligibility(null, rec())
    expect(r).toEqual({ allowed: false, reason: 'closed' })
  })

  it('חוסם מי שלא נרשם לחלוקה', () => {
    const r = decideCardEligibility(dist, null)
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.reason).toBe('not_registered')
  })

  it('חוסם בקשה שממתינה לאישור', () => {
    const r = decideCardEligibility(dist, rec({ approval_status: 'pending' }))
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.reason).toBe('not_approved')
  })

  it('חוסם בקשה שנדחתה, עם סיבה נפרדת מ"טרם אושר"', () => {
    const r = decideCardEligibility(dist, rec({ approval_status: 'rejected' }))
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.reason).toBe('rejected')
  })

  it('חוסם שיוך שני כשכרטיס כבר שויך בהצלחה', () => {
    const r = decideCardEligibility(dist, rec({ card_number: '1234567812345678', card_linked_at: '2026-08-04T10:00:00Z' }))
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.reason).toBe('already_linked')
  })

  it('מאפשר שיוך מחדש כשהמספר הוקש אך השיוך בנדרים לא הושלם', () => {
    // ⚠️ card_number בלי card_linked_at = כרטיס מת. חסימה כאן הייתה מנעילה את
    // המשפחה מחוץ למערכת בגלל תקלה של נדרים.
    const r = decideCardEligibility(dist, rec({ card_number: '1234567812345678', card_linked_at: null }))
    expect(r.allowed).toBe(true)
  })

  it('חוסם מצב אישור לא מוכר (ברירת מחדל חוסמת)', () => {
    const r = decideCardEligibility(dist, rec({ approval_status: 'on_hold' as unknown as 'approved' }))
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.reason).toBe('not_approved')
  })
})
