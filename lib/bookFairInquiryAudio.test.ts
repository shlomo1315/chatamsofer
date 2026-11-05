import { describe, it, expect } from 'vitest'
import { inquiryStorageKey } from './bookFairInquiryAudio'

describe('inquiryStorageKey', () => {
  it('מנקה תווים שאינם בטוחים לנתיב', () => {
    expect(inquiryStorageKey('abc/../x')).toBe('book-fair/inquiries/abc_.._x.wav')
  })
})
