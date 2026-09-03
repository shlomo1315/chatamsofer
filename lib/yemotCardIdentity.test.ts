import { describe, it, expect } from 'vitest'
import { checkCardIdentity, isKnownPhone, isoToDigits } from './yemotCardIdentity'

const STATE = {
  phones: ['0501234567', '0527654321', null],
  birthDates: ['1990-03-15', '1992-11-04'],
}

describe('isoToDigits — סדר ישראלי', () => {
  it('DDMMYYYY ולא ISO', () => {
    expect(isoToDigits('1990-03-15')).toBe('15031990')
  })
  it('ערך חסר או פגום', () => {
    expect(isoToDigits(null)).toBeNull()
    expect(isoToDigits('')).toBeNull()
    expect(isoToDigits('שטות')).toBeNull()
  })
})

describe('isKnownPhone', () => {
  it('מזהה מספר רשום', () => {
    expect(isKnownPhone('0501234567', STATE.phones)).toBe(true)
    expect(isKnownPhone('0527654321', STATE.phones)).toBe(true)
  })
  it('פורמט שונה עדיין מזוהה', () => {
    expect(isKnownPhone('972501234567', STATE.phones)).toBe(true)
    expect(isKnownPhone('050-123-4567', STATE.phones)).toBe(true)
  })
  it('מספר זר אינו מזוהה', () => {
    expect(isKnownPhone('0509999999', STATE.phones)).toBe(false)
  })
  // ⚠️ שיחה בלי זיהוי מתקשר מגיעה ריקה/קטועה — אסור שתעבור.
  it('מספר ריק או קטוע אינו מזוהה', () => {
    expect(isKnownPhone('', STATE.phones)).toBe(false)
    expect(isKnownPhone(null, STATE.phones)).toBe(false)
    expect(isKnownPhone('050', STATE.phones)).toBe(false)
  })
  it('כרטסת בלי טלפונים', () => {
    expect(isKnownPhone('0501234567', [null, null])).toBe(false)
  })
})

describe('checkCardIdentity — טלפון מוכר', () => {
  it('משייך מיד, בלי תאריך', () => {
    expect(checkCardIdentity(STATE, '0501234567')).toEqual({ ok: true, via: 'phone' })
  })
  it('גובר גם כשהוקש תאריך שגוי', () => {
    expect(checkCardIdentity(STATE, '0501234567', '01011111').ok).toBe(true)
  })
})

describe('checkCardIdentity — טלפון זר', () => {
  it('מבקש תאריך לידה', () => {
    expect(checkCardIdentity(STATE, '0509999999'))
      .toEqual({ ok: false, reason: 'need_birth_date' })
  })

  it('תאריך הבעל מאמת', () => {
    expect(checkCardIdentity(STATE, '0509999999', '15031990'))
      .toEqual({ ok: true, via: 'birth_date' })
  })

  // ⚠️ די באחד מהשניים — 126 משפחות חסר להן אחד מהתאריכים.
  it('תאריך האישה מאמת גם הוא', () => {
    expect(checkCardIdentity(STATE, '0509999999', '04111992'))
      .toEqual({ ok: true, via: 'birth_date' })
  })

  it('כרטסת עם תאריך אחד בלבד — עובדת', () => {
    const one = { phones: ['0501234567'], birthDates: ['1990-03-15', null] }
    expect(checkCardIdentity(one, '0509999999', '15031990').ok).toBe(true)
  })

  // 🔴 הליבה: מי שיודע ת"ז אך לא תאריך לידה — נחסם.
  it('תאריך שגוי נדחה', () => {
    expect(checkCardIdentity(STATE, '0509999999', '01011980'))
      .toEqual({ ok: false, reason: 'birth_date_mismatch' })
  })

  it('אורך שגוי נחשב אי-התאמה ולא "טרם הוקש"', () => {
    expect(checkCardIdentity(STATE, '0509999999', '1503199'))
      .toEqual({ ok: false, reason: 'birth_date_mismatch' })
    expect(checkCardIdentity(STATE, '0509999999', '150319900'))
      .toEqual({ ok: false, reason: 'birth_date_mismatch' })
  })

  // ⚠️ נכשל-סגור: בלי תאריך במערכת אי אפשר לאמת, ולא משייכים.
  it('כרטסת בלי תאריכי לידה — חסום', () => {
    const none = { phones: ['0501234567'], birthDates: [null, null] }
    expect(checkCardIdentity(none, '0509999999', '15031990'))
      .toEqual({ ok: false, reason: 'no_birth_date_on_file' })
  })

  it('כרטסת בלי תאריכים אך טלפון מוכר — עדיין עובר', () => {
    const none = { phones: ['0501234567'], birthDates: [null, null] }
    expect(checkCardIdentity(none, '0501234567').ok).toBe(true)
  })
})
