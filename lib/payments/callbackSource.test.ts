import { describe, it, expect } from 'vitest'
import { classifyCallbackSource } from './callbackSource'

const NEDARIM = '18.196.146.117'
const CF = '162.158.94.235'
const HOP = '79.127.178.82'

describe('🔴 classifyCallbackSource — לפי המבנה שנמדד בפרודקשן', () => {
  it('🔴 נדרים אמיתי: שרשרת תשתית + x-real-ip של נדרים ⇒ trusted', () => {
    expect(classifyCallbackSource(`${CF}, ${HOP}`, NEDARIM)).toBe('trusted')
  })
  it('🔴 בדיקת curl אמיתית מ-05.10 (לא נדרים) ⇒ unknown (נדחה)', () => {
    expect(classifyCallbackSource(`${CF}, ${HOP}`, '213.57.81.115')).toBe('unknown')
  })
  it('🔴 כתובת נדרים בשרשרת אבל x-real-ip אחר ⇒ spoofed (בדיקת אנוש)', () => {
    expect(classifyCallbackSource(`${NEDARIM}, ${CF}, ${HOP}`, '213.57.81.115')).toBe('spoofed')
  })
  it('בלי x-real-ip: האחרון בשרשרת הוא נדרים ⇒ trusted', () => {
    expect(classifyCallbackSource(`1.1.1.1, ${NEDARIM}`, null)).toBe('trusted')
  })
  it('🔴 בלי x-real-ip: נדרים רק לפני האחרון ⇒ spoofed', () => {
    expect(classifyCallbackSource(`${NEDARIM}, 213.57.81.115`, null)).toBe('spoofed')
  })
  it('כלום ⇒ unknown', () => {
    expect(classifyCallbackSource(null, null)).toBe('unknown')
    expect(classifyCallbackSource('', '')).toBe('unknown')
  })
})
