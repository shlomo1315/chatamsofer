import { describe, it, expect } from 'vitest'
import { auditNedarimSubmission, rawToRecord } from './kvitelNedarimAudit'
import type { KvitelNedarimConfig } from './kvitelNedarimPull'

const auto: KvitelNedarimConfig = { mosadId: '', apiKey: '', tofesId: '', contactField: '', phoneField: '', emailField: '', textField: '', lines: [] }

describe('דוח הבדיקה של נדרים פלוס', () => {
  it('raw_text חוזר לרשומה, כולל טקסט חופשי רב-שורות', () => {
    expect(rawToRecord('ClientName: כהן\nComments: משה בן שרה\nיוסף בן רחל\nPhone: 0501234567')).toEqual({
      ClientName: 'כהן', Comments: 'משה בן שרה\nיוסף בן רחל', Phone: '0501234567',
    })
  })

  it('קליטה ישירה: שמות בשדות וגם בטקסט החופשי, הטקסט החופשי חסר', () => {
    const raw = 'name1: דוד\nmother1: לאה\nrelation1: בן\nComments: משה בן שרה\nיוסף בן רחל'
    const a = auditNedarimSubmission({ kind: 'direct', rawText: raw, captured: 1 }, auto)
    expect(a).toMatchObject({ source: 3, structured: 1, free: 2, captured: 1, current: 3, missing: 2 })
    expect(a.reasons).toEqual(expect.arrayContaining(['free_ignored', 'reprocess_would_add']))
  })

  it('משיכה מהטופס עם מיפוי: שם בלי עמודת אם עובר לטקסט החופשי ונספר', () => {
    const mapped: KvitelNedarimConfig = { ...auto, textField: 'Field9', lines: [
      { name: 'Field1', mother: 'Field2', relation: 'Field3', request: '' },
      { name: 'Field4', mother: '', relation: '', request: '' },
    ] }
    const raw = 'ID: 77\nField1: דוד\nField2: לאה\nField3: בן\nField4: משה בן שרה\nField9: יוסף בן רחל'
    const a = auditNedarimSubmission({ kind: 'form', rawText: raw, captured: 3 }, mapped)
    expect(a).toMatchObject({ source: 3, captured: 3, current: 3, missing: 0 })
    expect(a.reasons).toEqual([])
  })

  it('שם בשדה שלא עובר אימות מסומן, ושורה שלא פוענחה נספרת', () => {
    const raw = 'name1: 123\nmother1: לאה\nComments: משה בן שרה\nבקשה מיוחדת בלי שם ברור'
    const a = auditNedarimSubmission({ kind: 'direct', rawText: raw, captured: 0 }, auto)
    expect(a.reasons).toEqual(expect.arrayContaining(['invalid_field', 'unparsed_text']))
    expect(a.unclear).toBeGreaterThan(0)
  })

  it('נקלט פחות ממה שהקליטה הנוכחית קולטת: מסומן לקליטה מחדש', () => {
    const a = auditNedarimSubmission({ kind: 'direct', rawText: 'Comments: משה בן שרה\nיוסף בן רחל', captured: 0 }, auto)
    expect(a).toMatchObject({ source: 2, current: 2, missing: 2 })
    expect(a.reasons).toContain('reprocess_would_add')
  })

  it('בלי טקסט מקור', () => {
    expect(auditNedarimSubmission({ kind: 'form', rawText: null, captured: 2 }, auto).reasons).toEqual(['no_raw'])
  })
})
