import { describe, it, expect } from 'vitest'
import { detectReqType } from './emailRequestForms'

describe('זיהוי סוג בקשה בנושא שהועבר', () => {
  const base = 'בקשת לידה 325453058 (מחקו את המספרים וכתבו ת"ז שלכם כולל ספרת ביקורת)'
  it('נושא רגיל מזוהה כבקשת לידה', () => {
    expect(detectReqType(base)).toBe('birth')
  })
  it('הקידומת Fwd: אינה שוברת את הזיהוי', () => {
    expect(detectReqType(`Fwd: ${base}`)).toBe('birth')
    expect(detectReqType(`FW: ${base}`)).toBe('birth')
  })
})
