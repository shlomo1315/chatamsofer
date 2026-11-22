import { describe, it, expect } from 'vitest'
import { normalizeRules, channelAllowed, blockedByDeepReview, DEFAULT_RULES } from './holidayDistRules'
import { checkBirthDate, typedBirthKey, birthDateForId, phoneMatches } from './holidayPhoneRegistrationRules'

describe('כללי חלוקה', () => {
  it('ברירת מחדל — הכל פתוח, השעות מוקראות', () => {
    expect(normalizeRules(null)).toEqual(DEFAULT_RULES)
  })
  it('בטלפון בלבד: רק phone ו-admin רושמים', () => {
    const r = normalizeRules({ phoneOnly: true })
    expect(channelAllowed(r, 'phone')).toBe(true)
    expect(channelAllowed(r, 'admin')).toBe(true)
    for (const s of ['portal', 'email', 'nedarim'] as const) expect(channelAllowed(r, s)).toBe(false)
  })
  it('בדיקה מעמיקה נחסמת רק כשמסומן', () => {
    expect(blockedByDeepReview(normalizeRules({}), 'deep_review')).toBe(false)
    expect(blockedByDeepReview(normalizeRules({ blockDeepReview: true }), 'deep_review')).toBe(true)
    expect(blockedByDeepReview(normalizeRules({ blockDeepReview: true }), 'approved')).toBe(false)
  })
})

describe('זיהוי ברישום הטלפוני', () => {
  it('תאריך לידה: יום-חודש-שנה מול ISO', () => {
    expect(checkBirthDate('15031990', '1990-03-15')).toBe('match')
    expect(checkBirthDate('15031990', '15/03/1990')).toBe('match')
    expect(checkBirthDate('16031990', '1990-03-15')).toBe('mismatch')
    expect(checkBirthDate('15031990', null)).toBe('unknown')
    expect(typedBirthKey('3213')).toBeNull()
    expect(typedBirthKey('32131990')).toBeNull()
  })
  it('תאריך של בן/בת הזוג כשהוקשה הת"ז שלהם', () => {
    const m = { id_number: '111', spouse_id_number: '222', birth_date: 'A', spouse_birth_date: 'B' }
    expect(birthDateForId('222', m)).toBe('B')
    expect(birthDateForId('111', m)).toBe('A')
  })
  it('טלפון: כל אחד מהמספרים בכרטסת', () => {
    const m = { phone: '052-765-4321', phone2: null, spouse_phone: '0541112222' }
    expect(phoneMatches('0527654321', m)).toBe(true)
    expect(phoneMatches('0541112222', m)).toBe(true)
    expect(phoneMatches('0500000000', m)).toBe(false)
  })
})

describe('מספרי ניסיון', () => {
  it('נרמול: ספרות, 972→0, בלי כפילויות', async () => {
    const { normalizeTestPhones, isTestCaller } = await import('./holidayDistRules')
    expect(normalizeTestPhones('050-123-4567, 972501234567; 123')).toEqual(['0501234567'])
    const r = normalizeRules({ testPhones: ['0501234567'] })
    expect(isTestCaller(r, '972501234567')).toBe(true)
    expect(isTestCaller(r, '0501234567')).toBe(true)
    expect(isTestCaller(r, '0509999999')).toBe(false)
    expect(isTestCaller(r, '')).toBe(false)
  })
})
