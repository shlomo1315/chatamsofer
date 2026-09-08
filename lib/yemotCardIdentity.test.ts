import { describe, it, expect } from 'vitest'
import { resolveCardFamily, isKnownPhone, type PhoneCandidate } from './yemotCardIdentity'

// ─────────────────────────────────────────────────────────────────────────────
// זיהוי לשיוך כרטיס בשלוחת החגים — טלפון בלבד, כמו ביולדות.
// ת"ז אינה ראיה; היא מכריעה רק בין משפחות של אותו מספר.
// ─────────────────────────────────────────────────────────────────────────────

const A: PhoneCandidate = { id: 'fam-a', id_number: '123456789' }
const B: PhoneCandidate = { id: 'fam-b', id_number: '987654321' }

describe('isKnownPhone', () => {
  it('מזהה את הטלפון הרשום', () => {
    expect(isKnownPhone('0501234567', ['050-123-4567'])).toBe(true)
  })

  it('אינו מזהה מספר זר', () => {
    expect(isKnownPhone('0509999999', ['0501234567'])).toBe(false)
  })

  it('שיחה בלי זיהוי מתקשר אינה נחשבת מוכרת', () => {
    expect(isKnownPhone('', ['0501234567'])).toBe(false)
    expect(isKnownPhone(null, ['0501234567'])).toBe(false)
    // ⚠️ מספר קטוע לא יעבור כהתאמה חלקית
    expect(isKnownPhone('0501', ['0501234567'])).toBe(false)
  })

  it('מתעלם משדות ריקים בכרטסת', () => {
    expect(isKnownPhone('0501234567', [null, '', '0501234567'])).toBe(true)
  })
})

describe('resolveCardFamily — מספר שאינו מזוהה', () => {
  it('נחסם, ואין מסלול עוקף', () => {
    expect(resolveCardFamily([])).toEqual({ ok: false, reason: 'phone_unknown' })
  })

  it('נחסם גם כשהוקשה ת"ז אמיתית — ת"ז אינה ראיה', () => {
    expect(resolveCardFamily([], '123456789'))
      .toEqual({ ok: false, reason: 'phone_unknown' })
  })
})

describe('resolveCardFamily — משפחה אחת (המקרה הרגיל)', () => {
  it('משייך מיד בלי שום הקשה', () => {
    expect(resolveCardFamily([A])).toEqual({ ok: true, via: 'phone', familyId: 'fam-a' })
  })

  it('ת"ז מיותרת אינה מפריעה', () => {
    expect(resolveCardFamily([A], '999999999'))
      .toEqual({ ok: true, via: 'phone', familyId: 'fam-a' })
  })
})

describe('resolveCardFamily — טלפון משותף לכמה משפחות', () => {
  it('מבקש ת"ז להכרעה ואינו מנחש', () => {
    expect(resolveCardFamily([A, B]))
      .toEqual({ ok: false, reason: 'need_id_choice' })
  })

  it('הת"ז מכריעה למשפחה הנכונה', () => {
    expect(resolveCardFamily([A, B], '987654321'))
      .toEqual({ ok: true, via: 'phone_and_id', familyId: 'fam-b' })
  })

  it('🔴 ת"ז של משפחה שאינה על המספר הזה — נדחית', () => {
    expect(resolveCardFamily([A, B], '555555555'))
      .toEqual({ ok: false, reason: 'id_not_on_phone' })
  })

  it('מתאים גם כשהת"ז שמורה בלי אפס מוביל', () => {
    const c: PhoneCandidate = { id: 'fam-c', id_number: '12345678' }
    expect(resolveCardFamily([A, c], '012345678'))
      .toEqual({ ok: true, via: 'phone_and_id', familyId: 'fam-c' })
  })

  it('משפחה בלי ת"ז אינה מותאמת בטעות למחרוזת ריקה', () => {
    const empty: PhoneCandidate = { id: 'fam-x', id_number: null }
    expect(resolveCardFamily([A, empty], ''))
      .toEqual({ ok: false, reason: 'need_id_choice' })
    expect(resolveCardFamily([A, empty], '000000000'))
      .toEqual({ ok: false, reason: 'id_not_on_phone' })
  })

  it('מכריע נכון גם כשיש שש משפחות על מספר אחד', () => {
    const many: PhoneCandidate[] = Array.from({ length: 6 }, (_, i) => ({
      id: `fam-${i}`, id_number: `10000000${i}`,
    }))
    expect(resolveCardFamily(many, '100000004'))
      .toEqual({ ok: true, via: 'phone_and_id', familyId: 'fam-4' })
  })
})
