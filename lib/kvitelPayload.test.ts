import { describe, expect, it } from 'vitest'
import { decodeKvitelPayload, encodeKvitelPayload } from './kvitelPayload'

describe('kvitelPayload', () => {
  const rows = [{ id: '1', raw_text: 'ידע פון https://yeda-phone.example שלום', name: 'משה בן שרה' }]

  it('מחזיר בדיוק את מה שנשלח', () => {
    expect(decodeKvitelPayload(encodeKvitelPayload(rows))).toEqual(rows)
  })

  it('המטען המעורבל לא מכיל את הטקסט, גם לא ב-base64 רגיל', () => {
    const { d } = encodeKvitelPayload(rows)
    const plain = Buffer.from(JSON.stringify(rows), 'utf8').toString('base64')
    expect(d).not.toContain('yeda')
    expect(Buffer.from(d, 'base64').toString('utf8')).not.toContain('yeda-phone')
    expect(d.slice(0, 12)).not.toBe(plain.slice(0, 12))
  })

  it('דוחה שיטת ערבול לא מוכרת', () => {
    expect(() => decodeKvitelPayload({ enc: 'zz', d: '' } as never)).toThrow()
  })
})
