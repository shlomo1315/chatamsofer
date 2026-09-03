import { describe, it, expect } from 'vitest'
import { parseReceiptReply } from './receiptOcr'

describe('parseReceiptReply — קבלת מספר תקין', () => {
  it('מספר פשוט', () => {
    expect(parseReceiptReply('{"number":"12345","confidence":"high"}'))
      .toEqual({ number: '12345', confidence: 'high' })
  })

  it('מקפים ולוכסנים מותרים', () => {
    expect(parseReceiptReply('{"number":"2026/447","confidence":"low"}').number).toBe('2026/447')
    expect(parseReceiptReply('{"number":"12-3456","confidence":"high"}').number).toBe('12-3456')
  })

  // ⚠️ המודל עוטף לעיתים ב-```json
  it('תשובה עטופה בגדר קוד', () => {
    expect(parseReceiptReply('```json\n{"number":"889","confidence":"high"}\n```').number).toBe('889')
  })

  it('רווחים מסביב נחתכים', () => {
    expect(parseReceiptReply('{"number":"  4471  ","confidence":"high"}').number).toBe('4471')
  })
})

// 🔴 החלק החשוב: מספר שגוי שנשמר בשקט גרוע ממספר חסר, כי איש לא יידע
// לבדוק אותו. כל ספק נפסל.
describe('parseReceiptReply — פסילת מה שאינו מספר קבלה', () => {
  it('null מפורש', () => {
    expect(parseReceiptReply('{"number":null,"confidence":null}'))
      .toEqual({ number: null, confidence: null })
  })

  it('טקסט מילולי נפסל', () => {
    expect(parseReceiptReply('{"number":"לא נמצא","confidence":"low"}').number).toBeNull()
    expect(parseReceiptReply('{"number":"קבלה 123","confidence":"high"}').number).toBeNull()
  })

  it('מספר ארוך מדי נפסל (ח.פ./טלפון שנתפס בטעות)', () => {
    expect(parseReceiptReply('{"number":"123456789012345678901","confidence":"high"}').number).toBeNull()
  })

  it('תו בודד נפסל', () => {
    expect(parseReceiptReply('{"number":"7","confidence":"high"}').number).toBeNull()
  })

  it('תשובה שאינה JSON אינה מפילה', () => {
    expect(() => parseReceiptReply('לא הצלחתי לקרוא')).not.toThrow()
    expect(parseReceiptReply('לא הצלחתי לקרוא').number).toBeNull()
    expect(parseReceiptReply('{שבור').number).toBeNull()
    expect(parseReceiptReply('').number).toBeNull()
  })

  // ⚠️ ביטחון שאינו 'high' נחשב 'low' — ברירת מחדל זהירה.
  it('ביטחון לא מוכר נחשב נמוך', () => {
    expect(parseReceiptReply('{"number":"55","confidence":"בטוח"}').confidence).toBe('low')
    expect(parseReceiptReply('{"number":"55"}').confidence).toBe('low')
  })
})
