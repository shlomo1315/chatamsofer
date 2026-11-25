import { describe, it, expect } from 'vitest'
import { mergeSavedOrder, moveTo, moveBy, arrangeKeys, fitMask, fitWidths } from './tableColumnLayout'

describe('mergeSavedOrder', () => {
  const code = ['name', 'id', 'phone', 'email', 'city'] as const

  it('בלי שמירה — סדר הקוד', () => {
    expect(mergeSavedOrder(code, null)).toEqual([...code])
  })

  it('שומר את הסדר של המשתמש', () => {
    expect(mergeSavedOrder(code, ['city', 'name', 'id', 'phone', 'email'])).toEqual(['city', 'name', 'id', 'phone', 'email'])
  })

  it('עמודה שנמחקה מהקוד יורדת, וכפולה נספרת פעם אחת', () => {
    expect(mergeSavedOrder(code, ['email', 'gone', 'email', 'name', 'id', 'phone', 'city'])).toEqual(['email', 'name', 'id', 'phone', 'city'])
  })

  it('עמודה חדשה נכנסת אחרי זו שקודמת לה בקוד, לא בסוף', () => {
    expect(mergeSavedOrder(code, ['city', 'name', 'id', 'email'])).toEqual(['city', 'name', 'id', 'phone', 'email'])
  })

  it('עמודה חדשה ראשונה בקוד נכנסת לראש', () => {
    expect(mergeSavedOrder(code, ['id', 'phone', 'email', 'city'])).toEqual(['name', 'id', 'phone', 'email', 'city'])
  })
})

describe('moveTo / moveBy', () => {
  const o = ['a', 'b', 'c', 'd']
  it('גרירה למקום של עמודה אחרת', () => {
    expect(moveTo(o, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(moveTo(o, 'd', 'a')).toEqual(['d', 'a', 'b', 'c'])
  })
  it('מפתח לא קיים — ללא שינוי', () => {
    expect(moveTo(o, 'x', 'a')).toEqual(o)
  })
  it('הזזה בצעד אחד ובקצוות', () => {
    expect(moveBy(o, 'b', 1)).toEqual(['a', 'c', 'b', 'd'])
    expect(moveBy(o, 'a', -1)).toEqual(o)
    expect(moveBy(o, 'd', 1)).toEqual(o)
  })
  it('מדלג על עמודות מוסתרות', () => {
    expect(moveBy(o, 'a', 1, k => k !== 'b')).toEqual(['b', 'c', 'a', 'd'])
  })
})

describe('arrangeKeys', () => {
  it('המוצמדות קודם, בסדר שלהן', () => {
    expect(arrangeKeys(['a', 'b', 'c', 'd'], new Set(['c', 'a']))).toEqual(['a', 'c', 'b', 'd'])
  })
})

describe('fitMask', () => {
  const none = [false, false, false, false]
  it('הכול נכנס', () => {
    expect(fitMask([100, 100, 100, 100], none, 100, 600)).toEqual([true, true, true, true])
  })
  it('מסתיר מסוף הסדר, בלי לדלג לעמודה קטנה יותר', () => {
    expect(fitMask([100, 200, 100, 50], none, 100, 450)).toEqual([true, true, false, false])
  })
  it('מוצמדת נשארת גם בסוף הסדר', () => {
    expect(fitMask([100, 200, 100, 50], [false, false, false, true], 100, 450)).toEqual([true, true, false, true])
  })
  it('box=0 — הכול נכנס', () => {
    expect(fitMask([900, 900], [false, false], 0, 0)).toEqual([true, true])
  })
})

describe('fitWidths', () => {
  it('נכנס — בלי שינוי', () => {
    expect(fitWidths([200, 100], [100, 80], 400)).toEqual([200, 100])
  })
  it('מכווץ יחסית למרווח, לא מתחת למינימום', () => {
    const w = fitWidths([200, 100], [100, 80], 240)
    expect(w).toEqual([150, 90])
    expect(w.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(240)
  })
  it('צר מהמינימום — נעצר במינימום', () => {
    expect(fitWidths([200, 100], [100, 80], 50)).toEqual([100, 80])
  })
})
