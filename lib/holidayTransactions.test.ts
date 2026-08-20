import { describe, it, expect } from 'vitest'
import { extractTransactions, parseTxDate } from './holidayTransactions'

// ⚠️ ההבחנה המרכזית: קנייה = יש שם חנות. בלי שם חנות זו טעינה/פריקה.
// בלי ההבחנה הזו "היסטוריית הקניות" הייתה מציגה גם את ה-500₪ שהמערכת
// טענה — כלומר מספר שאינו קנייה של המשפחה.

describe('extractTransactions', () => {
  it('🔴 מסנן טעינות — רק שורות עם שם חנות', () => {
    const rows = extractTransactions('r1', {
      History: [
        { StoreName: 'סופר כהן', Amount: '120', Date: '05/09/2026' },
        { StoreName: '', Amount: '500', Date: '01/09/2026' },       // טעינה
        { Amount: '-500', Date: '30/09/2026' },                      // פריקה
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].storeName).toBe('סופר כהן')
  })

  it('מחלץ סכום ותאריך', () => {
    const [row] = extractTransactions('r1', {
      History: [{ StoreName: 'מכולת', Amount: '99.50', Date: '12/09/2026' }],
    })
    expect(row.amount).toBe(99.5)
    expect(row.txDate).toContain('2026-09-12')
  })

  it('תומך ב-Store כשם חלופי', () => {
    const rows = extractTransactions('r1', { History: [{ Store: 'רמי לוי', Amount: '50' }] })
    expect(rows[0].storeName).toBe('רמי לוי')
  })

  it('כרטיס ריק או null אינו מפיל', () => {
    expect(extractTransactions('r1', null)).toEqual([])
    expect(extractTransactions('r1', {})).toEqual([])
    expect(extractTransactions('r1', { History: 'not-array' })).toEqual([])
  })

  it('סכום לא מספרי הופך ל-0 ולא ל-NaN', () => {
    const [row] = extractTransactions('r1', { History: [{ StoreName: 'x', Amount: 'לא מספר' }] })
    expect(row.amount).toBe(0)
  })
})

describe('parseTxDate', () => {
  it('dd/MM/yyyy', () => {
    expect(parseTxDate('05/09/2026')).toContain('2026-09-05')
  })

  it('⚠️ תאריך פגום מחזיר null ולא Invalid Date', () => {
    // Invalid Date שנשמר במסד מפיל את הרינדור — ראו lib/toSafeDateValue.
    expect(parseTxDate('לא תאריך')).toBeNull()
    expect(parseTxDate('')).toBeNull()
    expect(parseTxDate(null)).toBeNull()
  })
})
