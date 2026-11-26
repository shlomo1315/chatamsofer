import { describe, it, expect } from 'vitest'
import type { KvitelRequestRow } from './kvitelQuery'
import {
  addDays, batchShabbat, closeAt, closeLabel, hoursToClose, kvitelBatch, kvitelFile, kvitelPages, kvitelWeek, kvitelWeekTabs,
  maskPhone, openKvitelWeek, recentWeeks, sentLabel, shabbatOf, weekIntake, whenLabel,
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
    const intake = weekIntake(rows, { week: w, since: null, until: null })
    expect(intake.total).toBe(3)
    expect(intake.byChannel.map(c => [c.label, c.n])).toEqual([['לינק', 1], ['נדרים פלוס', 0], ['טלפון', 1], ['מייל', 1]])
    expect(sentLabel('2026-11-13T08:00:00Z')).toBe('ביום ו׳ ג׳ כסלו')
  })

  it('השבוע מתחלף בשליחה לציון ולא לפי הלוח: ויצא ← נשלח ← וישלח', () => {
    const today = '2026-11-19'                                  // יום ה׳, בלוח פרשת ויצא
    // עוד לא נשלחה אף מנה: השבוע הפתוח לפי הלוח
    expect(openKvitelWeek(null, today).parsha).toBe('ויצא')
    // נשלחה מנת תולדות בשבוע שעבר: עדיין ויצא, וכל הבקשות מאז שייכות אליו
    const toldot = { closed_at: '2026-11-13T09:00:00Z', parsha: 'תולדות' }
    expect(openKvitelWeek(toldot, today).parsha).toBe('ויצא')
    // ביום ה׳ נשלחה מנת ויצא: מיד נפתח וישלח, אף שבלוח השבת הקרובה היא עדיין ויצא
    const vayetze = { closed_at: '2026-11-19T10:00:00Z', parsha: 'ויצא' }
    expect(batchShabbat(vayetze)).toBe('2026-11-21')
    expect(openKvitelWeek(vayetze, today)).toMatchObject({ shabbat: '2026-11-28', parsha: 'וישלח' })
    // ואם לא שלחו עד אחרי שבת, הבקשות נשארות בשבוע של ויצא עד השליחה
    expect(openKvitelWeek(toldot, '2026-11-24').parsha).toBe('ויצא')
    // מנה שנסגרה מוקדם (וישלח נשלח עוד בשבוע של ויצא) נמצאת לפי הפרשה שנרשמה בה
    expect(batchShabbat({ closed_at: '2026-11-20T08:00:00Z', parsha: 'וישלח' })).toBe('2026-11-28')
    // מנה בלי פרשה: השבת של יום הסגירה
    expect(batchShabbat({ closed_at: '2026-11-19T10:00:00Z', parsha: null })).toBe('2026-11-21')

    // הלשוניות והקליטה: בקשה שנכנסה אחרי השליחה כבר בוישלח, גם אם זה עוד באותו יום
    const tabs = kvitelWeekTabs([vayetze, toldot], today)
    expect(tabs.map(t => t.week.parsha)).toEqual(['תולדות', 'ויצא', 'וישלח'])
    expect(tabs.map(t => t.batch?.parsha ?? null)).toEqual(['תולדות', 'ויצא', null])
    const rows = [
      row({ id: 'a', channel: 'email', status: 'done', submitted_at: '2026-11-15T08:00:00Z' }),
      row({ id: 'b', channel: 'nedarim', status: 'done', submitted_at: '2026-11-19T09:59:00Z' }),
      row({ id: 'c', channel: 'email', submitted_at: '2026-11-19T10:01:00Z' }),   // אחרי השליחה
      row({ id: 'd', channel: 'web', submitted_at: '2026-11-19T12:00:00Z' }),
    ]
    expect(weekIntake(rows, tabs[1]).total).toBe(2)            // ויצא: a, b
    const open = weekIntake(rows, tabs[2])                     // וישלח: c, d — מכל המקורות
    expect(open.total).toBe(2)
    expect(open.byChannel.map(c => c.n)).toEqual([1, 0, 0, 1])
    // הלשונית הישנה ביותר בלי מנה קודמת ברשימה: מתחילת השבוע בלוח
    expect(tabs[0].since).toBeNull()
    expect(kvitelWeekTabs([], today).map(t => [t.week.parsha, t.batch])).toEqual([['ויצא', null]])
    expect(kvitelWeekTabs([vayetze, toldot, toldot, toldot], today)).toHaveLength(4)
  })

  it('השבוע הפתוח לא מקדים את הלוח ביותר משבוע (26.11.2026: מנה כפולה וישלח + וישב)', () => {
    const today = '2026-11-26'                                  // יום ה׳, בלוח פרשת וישלח
    const vayishlach = { closed_at: '2026-11-26T07:29:56Z', parsha: 'וישלח' }
    expect(openKvitelWeek(vayishlach, today)).toMatchObject({ shabbat: '2026-12-05', parsha: 'וישב' })
    // המנה הכפולה שנרשמה כוישב 4 שניות אחר כך: עדיין וישב, לא מקץ
    const vayeshev = { closed_at: '2026-11-26T07:30:00Z', parsha: 'וישב' }
    expect(batchShabbat(vayeshev)).toBe('2026-12-05')
    expect(openKvitelWeek(vayeshev, today)).toMatchObject({ shabbat: '2026-12-05', parsha: 'וישב' })
    expect(kvitelWeekTabs([vayeshev, vayishlach], today).at(-1)?.week.parsha).toBe('וישב')
    // ביום א׳ 29.11 הלוח כבר בוישב, ומנה של וישב פותחת את מקץ כרגיל
    expect(openKvitelWeek(vayeshev, '2026-11-29').parsha).toBe('מקץ')
    // מנה ישנה עדיין משאירה את הבקשות בשבוע שאחריה, גם אם הלוח כבר התקדם
    expect(openKvitelWeek({ closed_at: '2026-11-13T09:00:00Z', parsha: 'תולדות' }, today).parsha).toBe('ויצא')
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
