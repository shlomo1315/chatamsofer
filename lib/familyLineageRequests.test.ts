import { describe, it, expect } from 'vitest'
import { toFamilyLineageRequest } from './familyLineageRequests'

describe('toFamilyLineageRequest', () => {
  it('מחלץ את הסיבה ואת השרשרת מבקשה שלא הוחלה', () => {
    const r = toFamilyLineageRequest({
      id: 's1', created_at: '2026-11-23T21:36:00Z', reviewer_name: 'רבינוביץ',
      payload: {
        text: 'בקשת תיקון סדר דורות (לא הוחלה אוטומטית — דור 5 אינו תואם את סדר הדורות המאושר):\nדור 1: חתם סופר',
        chain: [
          { generation: 2, name: 'רבי שמעון', relation: 'son' },
          { generation: 1, name: 'חתם סופר' },
          { generation: 3, name: 'x', relation: 'bogus' },
          { name: 'בלי דור' },
        ],
      },
    })
    expect(r.reason).toBe('דור 5 אינו תואם את סדר הדורות המאושר')
    expect(r.chain).toEqual([
      { generation: 1, name: 'חתם סופר', relation: null },
      { generation: 2, name: 'רבי שמעון', relation: 'son' },
      { generation: 3, name: 'x', relation: null },
    ])
  })

  it('בקשה בלי payload לא נופלת', () => {
    const r = toFamilyLineageRequest({ id: 's2', created_at: 'x', reviewer_name: null, payload: null })
    expect(r.reason).toBeNull()
    expect(r.chain).toEqual([])
  })
})
