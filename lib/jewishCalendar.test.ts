import { describe, it, expect } from 'vitest'
import { isBlockedForMail, nextAllowedSendTime, addDays } from './jewishCalendar'

// ISO עם offset מפורש — כדי שהבדיקות לא יהיו תלויות בשעון המכונה
const il = (iso: string) => new Date(iso)

// שולף את היום/השעה לפי שעון ישראל מתוך Date
function israelDate(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    }).formatToParts(d).map(x => [x.type, x.value]),
  )
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 }
}

describe('isBlockedForMail', () => {
  it('חוסם שבת', () => {
    // שבת, 11 ביולי 2026
    expect(isBlockedForMail(il('2026-07-11T10:00:00+03:00'))).toBe(true)
  })

  it('חוסם ערב שבת מ-14:00', () => {
    // שישי, 10 ביולי 2026, 15:00
    expect(isBlockedForMail(il('2026-07-10T15:00:00+03:00'))).toBe(true)
  })

  it('מתיר ערב שבת בבוקר', () => {
    // שישי, 10 ביולי 2026, 09:00
    expect(isBlockedForMail(il('2026-07-10T09:00:00+03:00'))).toBe(false)
  })

  it('מתיר יום חול רגיל', () => {
    // רביעי, 8 ביולי 2026
    expect(isBlockedForMail(il('2026-07-08T09:00:00+03:00'))).toBe(false)
  })

  it('חוסם יום כיפור', () => {
    // כ"י תשפ"ז — 21 בספטמבר 2026
    expect(isBlockedForMail(il('2026-09-21T10:00:00+03:00'))).toBe(true)
  })

  it('חוסם ראש השנה', () => {
    // ר"ה תשפ"ז — 12 בספטמבר 2026
    expect(isBlockedForMail(il('2026-09-12T10:00:00+03:00'))).toBe(true)
  })

  it('חוסם יום א של סוכות', () => {
    // סוכות תשפ"ז — 26 בספטמבר 2026
    expect(isBlockedForMail(il('2026-09-26T10:00:00+03:00'))).toBe(true)
  })

  it('מתיר חול המועד סוכות', () => {
    // חוה"מ סוכות — 29 בספטמבר 2026 (יום עבודה בישראל)
    expect(isBlockedForMail(il('2026-09-29T09:00:00+03:00'))).toBe(false)
  })

  it('מתיר חנוכה', () => {
    // חנוכה תשפ"ז — דצמבר 2026 (לא יו"ט)
    expect(isBlockedForMail(il('2026-12-07T09:00:00+03:00'))).toBe(false)
  })
})

describe('nextAllowedSendTime', () => {
  it('מזיז שבת ליום ראשון 09:00', () => {
    const out = nextAllowedSendTime(il('2026-07-11T10:00:00+03:00'))
    const g = israelDate(out)
    expect(g.date).toBe('2026-07-12') // ראשון
    expect(g.hour).toBe(9)
  })

  it('לא נוגע בתאריך שכבר מותר', () => {
    const d = il('2026-07-08T09:00:00+03:00')
    expect(nextAllowedSendTime(d).getTime()).toBe(d.getTime())
  })

  it('מזיז ערב שבת אחה"צ ליום ראשון', () => {
    const out = nextAllowedSendTime(il('2026-07-10T16:00:00+03:00'))
    expect(israelDate(out).date).toBe('2026-07-12')
  })

  it('מזיז יום כיפור ליום חול', () => {
    const out = nextAllowedSendTime(il('2026-09-21T10:00:00+03:00'))
    expect(isBlockedForMail(out)).toBe(false)
    expect(israelDate(out).hour).toBe(9)
  })

  it('תמיד מחזיר מועד שאינו חסום — 400 ימים רצופים', () => {
    for (let i = 0; i < 400; i++) {
      const input = addDays(il('2026-01-01T12:00:00+02:00'), i)
      const out = nextAllowedSendTime(input)
      expect(isBlockedForMail(out)).toBe(false)
    }
  })

  it('תמיד מחזיר מועד שאינו חסום — גם בשעות ערב', () => {
    for (let i = 0; i < 400; i++) {
      const input = addDays(il('2026-01-01T18:30:00+02:00'), i)
      expect(isBlockedForMail(nextAllowedSendTime(input))).toBe(false)
    }
  })
})
