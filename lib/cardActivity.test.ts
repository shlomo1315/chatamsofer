import { describe, it, expect } from 'vitest'
import { parseCardActivity } from './cardActivity'

describe('parseCardActivity', () => {
  it('קניות בלבד, בלי שורת פריקה', () => {
    const r = parseCardActivity({
      TotalFreeAmount: '550 ₪',
      History: [
        { HistoryId: '2', Date: '25/08/26 00:12', Amount: '0.21', Comments: 'פריקת תלוש ע"י הקופה' },
        { HistoryId: '1', Date: '20/08/26 10:00', StoreName: 'שובע שמחות', Amount: '50 ₪', Comments: '' },
      ],
    })
    expect(r.balance).toBe(550)
    expect(r.purchases).toEqual([{ id: '1', date: '20/08/26 10:00', store: 'שובע שמחות', amount: 50 }])
  })
  it('תשובה ריקה', () => {
    expect(parseCardActivity(null)).toEqual({ purchases: [], balance: null })
  })
})
