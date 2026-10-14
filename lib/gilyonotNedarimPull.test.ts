import { describe, it, expect } from 'vitest'
import { parseGetJson, mapRow, buildGetJsonParam, validateConfig, isFieldName } from './gilyonotNedarimPull'
import { decideSubscribe } from './gilyonot'

const cfg = { emailField: 'Field9', nameField: 'Field7', consentField: '' }

describe('gilyonot נדרים: תשובת GetJson', () => {
  it('קורא מערך רשומות, כל הערכים כמחרוזות', () => {
    const text = JSON.stringify([
      { ID: '101', CreatedDate: '14/10/2026 10:00', MasofId: '', TransactionId: '', Field7: 'משה כהן', Field9: 'Moshe@Gmail.com' },
      { ID: 102, CreatedDate: '14/10/2026 11:00', Field7: 'לוי', Field9: null },
    ])
    const r = parseGetJson(text)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.rows).toHaveLength(2)
      expect(r.rows[1]).toMatchObject({ ID: '102', Field9: '' })
    }
  })
  it('מערך ריק = סוף הלולאה', () => {
    expect(parseGetJson('[]')).toEqual({ ok: true, rows: [] })
  })
  it('שגיאה מנדרים מוחזרת עם ההודעה שלהם', () => {
    expect(parseGetJson('{"Status":"Error","Message":"ApiPassword שגוי"}')).toEqual({ ok: false, error: 'ApiPassword שגוי' })
  })
  it('תשובה שאינה JSON לא מפילה', () => {
    const r = parseGetJson('<html>Error</html>')
    expect(r.ok).toBe(false)
  })
  it('רשומה בלי ID מספרי מסוננת', () => {
    const r = parseGetJson('[{"ID":"abc","Field9":"a@b.com"}]')
    expect(r.ok && r.rows).toEqual([])
  })
})

describe('gilyonot נדרים: מיפוי רשומה', () => {
  it('מייל ושם לפי העמודות שנבחרו', () => {
    expect(mapRow({ ID: '101', Field7: '  משה   כהן ', Field9: 'Moshe@Gmail.com ' }, cfg))
      .toEqual({ ok: true, email: 'moshe@gmail.com', name: 'משה כהן', sourceRef: 'nedarim-form:101' })
  })
  it('בלי מייל תקין — לא נקלט', () => {
    expect(mapRow({ ID: '1', Field9: 'לא מייל' }, cfg)).toEqual({ ok: false, reason: 'invalid_email' })
  })
  it('עמודת אישור: ריק, 0 או "לא" — לא נקלט', () => {
    const c = { ...cfg, consentField: 'Field10' }
    for (const v of ['', '0', 'לא', 'false']) {
      expect(mapRow({ ID: '1', Field9: 'a@b.com', Field10: v }, c)).toEqual({ ok: false, reason: 'no_consent' })
    }
    expect(mapRow({ ID: '1', Field9: 'a@b.com', Field10: '1' }, c).ok).toBe(true)
    expect(mapRow({ ID: '1', Field9: 'a@b.com', Field10: 'כן' }, c).ok).toBe(true)
  })
  it('משיכה לא מחזירה מי שהסיר את עצמו', () => {
    const gone = { status: 'unsubscribed' as const, full_name: null }
    expect(decideSubscribe(gone, { source: 'nedarim', name: null, noReactivate: true })).toBe('blocked_unsubscribed')
  })
})

describe('gilyonot נדרים: הגדרות', () => {
  it('GetJsonParam בונה מפה של העמודות, בלי כפילויות ובלי שמות לא חוקיים', () => {
    expect(buildGetJsonParam(['Field9', 'Field7', 'Field9', 'Field101', 'x'])).toBe('{"Field9":"Field9","Field7":"Field7"}')
  })
  it('שמות עמודות בטווח של נדרים', () => {
    expect(isFieldName('Field1')).toBe(true)
    expect(isFieldName('Field100')).toBe(true)
    expect(isFieldName('Field10Max')).toBe(true)
    expect(isFieldName('Field11Max')).toBe(false)
    expect(isFieldName('Field0')).toBe(false)
  })
  it('אימות מוסד, טופס ומפתח', () => {
    const ok = { mosadId: '1234567', tofesId: '4563', apiKey: 'npk_abc123', emailField: 'Field9', nameField: '', consentField: '' }
    expect(validateConfig(ok)).toBeNull()
    expect(validateConfig({ ...ok, mosadId: '123' })).toMatch(/7 ספרות/)
    expect(validateConfig({ ...ok, apiKey: 'abc' })).toMatch(/npk_/)
    expect(validateConfig({ ...ok, emailField: 'Email' })).toMatch(/עמודה/)
  })
})
