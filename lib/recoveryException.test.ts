import { describe, it, expect } from 'vitest'
import { cleanExceptionHome, checkReceipt, receiptDisplayName } from './recoveryException'

describe('בית החלמה חריג', () => {
  it('מנקה את שם המקום ודוחה ריק או ארוך', () => {
    expect(cleanExceptionHome('  מלון   הר ציון ')).toBe('מלון הר ציון')
    expect(cleanExceptionHome('   ')).toBeNull()
    expect(cleanExceptionHome(5)).toBeNull()
    expect(cleanExceptionHome('א'.repeat(121))).toBeNull()
  })

  it('מקבל PDF ותמונה בלבד ובגודל סביר', () => {
    expect(checkReceipt('application/pdf', 1000)).toEqual({ ext: 'pdf' })
    expect(checkReceipt('image/jpeg', 1000)).toEqual({ ext: 'jpg' })
    expect(checkReceipt('text/html', 1000)).toHaveProperty('error')
    expect(checkReceipt('application/pdf', 0)).toHaveProperty('error')
    expect(checkReceipt('application/pdf', 16 * 1024 * 1024)).toHaveProperty('error')
  })

  it('שם קובץ בטוח להצגה', () => {
    expect(receiptDisplayName('a/b:c.pdf', 'pdf')).toBe('a b c.pdf')
    expect(receiptDisplayName('', 'png')).toBe('קבלה.png')
  })
})
