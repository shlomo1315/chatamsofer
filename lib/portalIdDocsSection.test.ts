import { describe, it, expect } from 'vitest'
import { shouldShowIdDocsSection } from './portalIdDocsSection'

describe('shouldShowIdDocsSection', () => {
  it('משפחה מאושרת בבקשת לידה רואה את משבצות הת"ז', () => {
    expect(shouldShowIdDocsSection({ hasBeneficiary: true, isApproved: true, isBirthRequest: true })).toBe(true)
  })
  it('משפחה מאושרת שלא בבקשת לידה — הקטע מוסתר', () => {
    expect(shouldShowIdDocsSection({ hasBeneficiary: true, isApproved: true, isBirthRequest: false })).toBe(false)
  })
  it('משפחה שטרם אושרה רואה תמיד', () => {
    expect(shouldShowIdDocsSection({ hasBeneficiary: true, isApproved: false, isBirthRequest: false })).toBe(true)
  })
  it('הלוואה (forceFresh) מוצגת גם למאושרת', () => {
    expect(shouldShowIdDocsSection({ hasBeneficiary: true, isApproved: true, isBirthRequest: false, forceFresh: true })).toBe(true)
  })
  it('בלי מוטב — לא מוצג', () => {
    expect(shouldShowIdDocsSection({ hasBeneficiary: false, isApproved: false, isBirthRequest: true, forceFresh: true })).toBe(false)
  })
})
