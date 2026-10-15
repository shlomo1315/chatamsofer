import { describe, it, expect } from 'vitest'
import { detectColumns } from './gilyonotDetect'

describe('gilyonot נדרים: זיהוי עמודות לפי התוכן', () => {
  it('מוצא מייל גם בעמודה אחרי Field15', () => {
    const rows = [
      { ID: '3', Field1: 'משה כהן', Field2: '0501234567', Field42: 'moshe@gmail.com' },
      { ID: '2', Field1: 'דוד לוי', Field2: '0527654321', Field42: ' David@Walla.co.il ' },
    ]
    expect(detectColumns(rows)).toEqual({ emailField: 'Field42', nameField: 'Field1' })
  })

  it('שדות ריקים וחסרים לא מפילים את הזיהוי', () => {
    const rows: Record<string, string>[] = [
      { ID: '3', Field3: '', Field7: 'a@b.co' },
      { ID: '2', Field3: 'שרה', Field7: '' },
      { ID: '1', Field3: 'רבקה' },
    ]
    expect(detectColumns(rows)).toEqual({ emailField: 'Field7', nameField: 'Field3' })
  })

  it('בוחר את העמודה שיש בה הכי הרבה מיילים', () => {
    const rows = [
      { Field1: 'x@y.com', Field5: 'a@b.com' },
      { Field1: 'לא מייל', Field5: 'c@d.com' },
    ]
    expect(detectColumns(rows).emailField).toBe('Field5')
  })

  it('בלי מיילים מחזיר עמודה ריקה', () => {
    expect(detectColumns([{ Field1: 'שם', Field2: '123' }]).emailField).toBe('')
    expect(detectColumns([])).toEqual({ emailField: '', nameField: '' })
  })
})
