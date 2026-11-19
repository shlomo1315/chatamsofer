import { describe, it, expect } from 'vitest'
import { decodeFromSaved, decodeFromText, mailPlainText } from './kvitelMailDecode'

describe('decodeFromSaved', () => {
  it('מציג את השורות שנשמרו לפי הסדר, עם הבקשה ותווית הסטטוס', () => {
    const r = decodeFromSaved({ id: 'r1', status: 'review', note: 'פוענח מהמייל' }, [
      { name: 'רחל', relation: 'bat', parent_name: 'לאה', request_type: 'other', request_note: 'להצלחה במבחן', flag_reason: 'בקשה חריגה', position: 1 },
      { name: 'משה', relation: 'ben', parent_name: 'שרה', request_type: 'refua', request_note: null, flag_reason: null, position: 0 },
    ])
    expect(r.source).toBe('saved')
    expect(r.status).toBe('לבדיקה')
    expect(r.failed).toBeNull()
    expect(r.lines).toEqual([
      { name: 'משה', relation: 'בן', parentName: 'שרה', request: 'לרפואה שלימה', flag: null },
      { name: 'רחל', relation: 'בת', parentName: 'לאה', request: 'להצלחה במבחן', flag: 'בקשה חריגה' },
    ])
  })

  it('בקשה שנשמרה בלי שמות מסומנת ככישלון', () => {
    const r = decodeFromSaved({ id: 'r1', status: 'review', note: null }, [])
    expect(r.lines).toEqual([])
    expect(r.failed).toMatch(/בלי שמות/)
  })
})

describe('decodeFromText', () => {
  it('מפענח מייל שעוד לא נקלט לפי התבנית הקיימת', () => {
    const r = decodeFromText('קויטל', 'משה בן שרה - לרפואה שלימה')
    expect(r.source).toBe('pattern')
    expect(r.failed).toBeNull()
    expect(r.lines[0]).toMatchObject({ name: 'משה', relation: 'בן', parentName: 'שרה', request: 'לרפואה שלימה' })
  })

  it('מייל בלי שם במבנה המוכר מסומן ככישלון', () => {
    const r = decodeFromText('שאלה', 'שלום, מתי נוסעים לציון?')
    expect(r.lines).toEqual([])
    expect(r.failed).toMatch(/הפיענוח נכשל/)
  })
})

describe('mailPlainText', () => {
  it('מעדיף את הטקסט הגולמי', () => {
    expect(mailPlainText('שלום', '<p>אחר</p>')).toBe('שלום')
  })
  it('בלי טקסט גולמי מסיר תגיות מה-HTML', () => {
    expect(mailPlainText('', '<style>p{}</style><p>משה בן שרה</p><div>רחל בת לאה</div>')).toBe('משה בן שרה\nרחל בת לאה')
  })
})
