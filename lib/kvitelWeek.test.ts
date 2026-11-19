import { describe, it, expect } from 'vitest'
import type { KvitelRequestRow } from './kvitelQuery'
import {
  addDays, closeAt, closeLabel, hoursToClose, kvitelBatch, kvitelFile, kvitelPages, kvitelWeek, maskPhone, recentWeeks,
  sentLabel, shabbatOf, weekIntake, weekSent, whenLabel,
} from './kvitelWeek'

const row = (over: Partial<KvitelRequestRow>): KvitelRequestRow => ({
  id: 'r', channel: 'web', status: 'pending', contact_name: 'משה', contact_phone: '0521234417', contact_email: null,
  raw_text: null, recording_url: null, note: null, submitted_at: '2026-11-17T08:00:00Z', done_at: null,
  kvitel_request_lines: [{ id: 'a', position: 0, name: 'מאיר', relation: 'ben', parent_name: 'רחל', request_type: 'refua', request_note: null, flagged: false, flag_reason: null }],
  ...over,
})

describe('kvitelWeek', () => {
  it('שבוע = ראשון עד שבת, על שם הפרשה', () => {
    expect(shabbatOf('2026-11-19')).toBe('2026-11-21')
    expect(shabbatOf('2026-11-21')).toBe('2026-11-21')
    expect(shabbatOf('2026-11-22')).toBe('2026-11-28')
    const w = kvitelWeek('2026-11-21')
    expect(w).toMatchObject({ from: '2026-11-15', to: '2026-11-21', parsha: 'ויצא', label: 'ערש״ק פרשת ויצא תשפ״ז' })
    expect(recentWeeks('2026-11-19').map(x => x.shabbat)).toEqual(['2026-10-31', '2026-11-07', '2026-11-14', '2026-11-21'])
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('סגירה ביום ו׳ 12:00 שעון ישראל, וספירת שעות', () => {
    const w = kvitelWeek('2026-11-21')
    expect(new Date(closeAt(w)).toISOString()).toBe('2026-11-20T10:00:00.000Z')          // חורף, +2
    expect(new Date(closeAt(kvitelWeek('2026-07-04'))).toISOString()).toBe('2026-07-03T09:00:00.000Z') // קיץ, +3
    expect(hoursToClose(w, Date.parse('2026-11-19T03:00:00Z'))).toBe(31)
    expect(hoursToClose(w, Date.parse('2026-11-20T10:00:00Z'))).toBeNull()
    expect(closeLabel(w)).toBe('ביום ו׳, י׳ כסלו')
  })

  it('נכנסו השבוע לפי ערוץ, ונשלח לציון לפי זמן הסימון', () => {
    const w = kvitelWeek('2026-11-21')
    const rows = [
      row({ id: '1', channel: 'web' }),
      row({ id: '2', channel: 'phone', status: 'review' }),
      row({ id: '3', channel: 'phone', submitted_at: '2026-11-14T21:30:00Z' }),            // 23:30 בשבת → לא בשבוע
      row({ id: '4', channel: 'email', submitted_at: '2026-11-14T22:30:00Z' }),            // 00:30 ביום ראשון → בשבוע
      row({ id: '5', status: 'done', submitted_at: '2026-11-10T08:00:00Z', done_at: '2026-11-16T08:00:00Z' }),
      row({ id: '6', status: 'done', submitted_at: '2026-11-10T08:00:00Z', done_at: '2026-11-18T08:00:00Z' }),
      row({ id: '7', status: 'done', submitted_at: '2026-11-10T08:00:00Z', done_at: '2026-11-12T08:00:00Z' }),
    ]
    const intake = weekIntake(rows, w)
    expect(intake.total).toBe(3)
    expect(intake.byChannel.map(c => [c.label, c.n])).toEqual([['לינק', 1], ['נדרים פלוס', 0], ['טלפון', 1], ['מייל', 1]])
    expect(weekSent(rows, w)).toEqual({ count: 2, at: '2026-11-18T08:00:00Z' })
    expect(weekSent(rows, kvitelWeek('2026-11-28'))).toEqual({ count: 0, at: null })
    expect(sentLabel('2026-11-13T08:00:00Z')).toBe('ביום ו׳ ג׳ כסלו')
  })

  it('בקובץ: רק "לא נשלח" עם שמות — "לבדיקה" נשאר בחוץ', () => {
    const f = kvitelFile([
      row({ id: '1' }),
      row({ id: '2', status: 'review' }),
      row({ id: '3', kvitel_request_lines: [] }),
      row({ id: '4', status: 'done' }),
    ])
    expect(f.ids).toEqual(['1'])
    expect(f.lines).toEqual(['מאיר בן רחל - לרפואה שלימה'])
    expect(f.pages).toBe(1)
  })

  it('מנה נרשמת רק מהמזהים שירדו, ורק מה שעדיין "לא נשלח"', () => {
    const rows = [
      row({ id: '1' }),
      row({ id: '2', status: 'review' }),                          // הוחזר לבדיקה אחרי ההורדה
      row({ id: '3', status: 'done' }),                            // כבר נשלח במנה אחרת
      row({ id: '4' }),                                            // נכנס אחרי ההורדה — לא במנה
    ]
    const b = kvitelBatch(rows, ['1', '2', '3'])
    expect(b.ids).toEqual(['1'])
    expect(b.lines).toEqual(['מאיר בן רחל - לרפואה שלימה'])
    expect(kvitelBatch(rows, []).ids).toEqual([])
  })

  it('עמודי A4: 19 בראשון, 24 בכל עמוד נוסף', () => {
    expect([0, 1, 19, 20, 43, 44, 548].map(kvitelPages)).toEqual([0, 1, 1, 2, 2, 3, 24])
  })

  it('טלפון מוסתר וזמן קריא', () => {
    expect(maskPhone('0521234417')).toBe('052-•••-4417')
    expect(maskPhone(null)).toBe('')
    const now = Date.parse('2026-11-19T12:00:00Z')
    expect(whenLabel('2026-11-19T06:12:00Z', now)).toBe('היום 08:12')
    expect(whenLabel('2026-11-18T19:40:00Z', now)).toBe('אתמול 21:40')
    expect(whenLabel('2026-11-17T12:20:00Z', now)).toBe('ג׳ 14:20')
  })
})
