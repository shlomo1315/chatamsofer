import { describe, it, expect } from 'vitest'
import { getScheduleState, isRegistrationOpenNow, closedMessage, formatDeadline } from './distributionSchedule'

// זמנים מקובעים — בלי new Date() חי, כדי שהבדיקות לא ישתנו עם השעון.
const OPENS = '2026-08-10T05:00:00.000Z'   // 08:00 בישראל
const CLOSES = '2026-08-14T17:00:00.000Z'  // 20:00 בישראל
const win = { registration_open: true, registration_opens_at: OPENS, registration_closes_at: CLOSES }

describe('getScheduleState', () => {
  it('פתוח בתוך החלון', () => {
    const r = getScheduleState(win, new Date('2026-08-12T10:00:00Z'))
    expect(r.open).toBe(true)
    expect(r.state).toBe('open')
  })

  it('סגור לפני מועד הפתיחה', () => {
    const r = getScheduleState(win, new Date('2026-08-09T10:00:00Z'))
    expect(r.open).toBe(false)
    expect(r.state).toBe('before_open')
    expect(r.at).toBe(OPENS)
  })

  it('סגור אחרי מועד הסגירה', () => {
    const r = getScheduleState(win, new Date('2026-08-15T10:00:00Z'))
    expect(r.open).toBe(false)
    expect(r.state).toBe('after_close')
    expect(r.at).toBe(CLOSES)
  })

  // ⚠️ הגבולות המדויקים — כאן נופלות מערכות תזמון
  it('הפתיחה נכללת — רישום בשנייה המדויקת מתקבל', () => {
    expect(getScheduleState(win, new Date(OPENS)).open).toBe(true)
  })

  it('הסגירה אינה נכללת — רישום בשנייה המדויקת נדחה', () => {
    expect(getScheduleState(win, new Date(CLOSES)).open).toBe(false)
  })

  it('שנייה לפני הסגירה — עדיין פתוח', () => {
    expect(getScheduleState(win, new Date(Date.parse(CLOSES) - 1000)).open).toBe(true)
  })

  // ⚠️ המתג הידני גובר תמיד — עצירת חירום
  it('מתג כבוי סוגר גם באמצע החלון', () => {
    const r = getScheduleState({ ...win, registration_open: false }, new Date('2026-08-12T10:00:00Z'))
    expect(r.open).toBe(false)
    expect(r.state).toBe('switch_off')
  })

  it('מתג דלוק בלי חלון — פתוח, כמו ההתנהגות הקיימת', () => {
    expect(isRegistrationOpenNow({ registration_open: true }, new Date())).toBe(true)
  })

  it('רק מועד סגירה, בלי פתיחה', () => {
    const d = { registration_open: true, registration_closes_at: CLOSES }
    expect(isRegistrationOpenNow(d, new Date('2026-08-01T00:00:00Z'))).toBe(true)
    expect(isRegistrationOpenNow(d, new Date('2026-08-20T00:00:00Z'))).toBe(false)
  })

  it('רק מועד פתיחה, בלי סגירה', () => {
    const d = { registration_open: true, registration_opens_at: OPENS }
    expect(isRegistrationOpenNow(d, new Date('2026-08-09T00:00:00Z'))).toBe(false)
    expect(isRegistrationOpenNow(d, new Date('2026-09-01T00:00:00Z'))).toBe(true)
  })

  // ⚠️ fail-open על ערך פגום: חלון בלתי קריא לא יחסום את כל המשפחות בשקט
  it('תאריך פגום נחשב כלא-מוגדר ואינו חוסם', () => {
    expect(isRegistrationOpenNow(
      { registration_open: true, registration_closes_at: 'לא-תאריך' }, new Date())).toBe(true)
  })

  it('מתג null/undefined = סגור', () => {
    expect(isRegistrationOpenNow({}, new Date())).toBe(false)
    expect(isRegistrationOpenNow({ registration_open: null }, new Date())).toBe(false)
  })
})

describe('closedMessage', () => {
  it('אומר מתי נסגר, לא רק שסגור', () => {
    const m = closedMessage(getScheduleState(win, new Date('2026-08-15T10:00:00Z')))
    expect(m).toContain('נסגר')
    expect(m).toContain('14.08.2026')
    expect(m).toContain('20:00')
  })

  it('אומר מתי ייפתח', () => {
    const m = closedMessage(getScheduleState(win, new Date('2026-08-09T10:00:00Z')))
    expect(m).toContain('ייפתח')
    expect(m).toContain('08:00')
  })

  it('מתג כבוי — ההודעה הגנרית הקיימת', () => {
    const m = closedMessage(getScheduleState({ registration_open: false }, new Date()))
    expect(m).toBe('אין כרגע חלוקה שהרישום אליה פתוח')
  })

  it('חלוקה פתוחה — בלי הודעה', () => {
    expect(closedMessage(getScheduleState(win, new Date('2026-08-12T10:00:00Z')))).toBe('')
  })
})

describe('formatDeadline', () => {
  // ⚠️ שעון ישראל מקובע: 17:00 UTC בקיץ = 20:00 מקומי
  it('מציג בשעון ישראל ולא ב-UTC', () => {
    const s = formatDeadline(CLOSES)
    expect(s).toContain('20:00')
    expect(s).toContain('14.08.2026')
    expect(s).toContain('שישי')
  })

  it('ערך ריק/פגום מחזיר מחרוזת ריקה', () => {
    expect(formatDeadline(null)).toBe('')
    expect(formatDeadline('בלגן')).toBe('')
  })
})
