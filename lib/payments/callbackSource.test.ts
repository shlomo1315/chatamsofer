import { describe, it, expect } from 'vitest'
import { classifyCallbackSource } from './callbackSource'

const NEDARIM = '18.196.146.117'
const HOP = '79.127.178.82'

describe('🔴 classifyCallbackSource', () => {
  it('נדרים אמיתי: מקור + קפיצת ביניים ⇒ trusted', () => {
    expect(classifyCallbackSource(`${NEDARIM}, ${HOP}`, null)).toBe('trusted')
  })
  it('נדרים בלי קפיצת ביניים (מקור אחרון) ⇒ trusted', () => {
    expect(classifyCallbackSource(`${NEDARIM}`, null)).toBe('trusted')
  })
  it('🔴 הזיוף מהביקורת: הכותרת המזויפת לפני המקור האמיתי ⇒ spoofed', () => {
    expect(classifyCallbackSource(`${NEDARIM}, 213.57.81.115, ${HOP}`, null)).toBe('spoofed')
  })
  it('🔴 זיוף בכמה ערכים לפני ⇒ spoofed', () => {
    expect(classifyCallbackSource(`1.1.1.1, ${NEDARIM}, 9.9.9.9, 213.57.81.115, ${HOP}`, null)).toBe('spoofed')
  })
  it('🔴 x-real-ip לבדו לא מעניק אמון כשיש שרשרת', () => {
    expect(classifyCallbackSource(`213.57.81.115, ${HOP}`, NEDARIM)).toBe('spoofed')
  })
  it('בלי שרשרת — x-real-ip הוא המקור', () => {
    expect(classifyCallbackSource(null, NEDARIM)).toBe('trusted')
    expect(classifyCallbackSource('', '5.5.5.5')).toBe('unknown')
  })
  it('אין כתובת של נדרים בכלל ⇒ unknown (נדחה כמו קודם)', () => {
    expect(classifyCallbackSource(`213.57.81.115, ${HOP}`, null)).toBe('unknown')
    expect(classifyCallbackSource(null, null)).toBe('unknown')
  })
})
