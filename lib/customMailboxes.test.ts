import { describe, it, expect } from 'vitest'
import {
  isValidMailbox, mailboxKeyFor, asDepartment, CUSTOM_PREFIX,
} from './customMailboxes'
import { DEPARTMENTS } from './departments'

// 🔴 DEPARTMENTS קבוע בקוד — הוספת כתובת חייבה שינוי קוד ופריסה, ולכן
// אי אפשר היה להפעיל מענה אוטומטי לכתובת חדשה בלי מפתח. התיבות כאן
// נשמרות במסד ומצטרפות בזמן ריצה.

describe('isValidMailbox', () => {
  it('כתובת ותווית תקינות', () => {
    expect(isValidMailbox({ email: 'new@chasamsofer.info', label: 'תיבה חדשה' })).toBe(true)
  })

  it('🔴 כתובת פגומה נדחית', () => {
    // כתובת פגומה נכנסת לרשימת הניתוב, וכל מייל שמגיע אליה אינו מזוהה —
    // בלי שום שגיאה גלויה.
    expect(isValidMailbox({ email: 'לא-מייל', label: 'תיבה' })).toBe(false)
    expect(isValidMailbox({ email: 'a@b', label: 'תיבה' })).toBe(false)
    expect(isValidMailbox({ email: 'a b@c.com', label: 'תיבה' })).toBe(false)
  })

  it('בלי תווית נדחית — אחרת התיבה מופיעה בלי שם', () => {
    expect(isValidMailbox({ email: 'a@b.com', label: '' })).toBe(false)
    expect(isValidMailbox({ email: 'a@b.com', label: '   ' })).toBe(false)
  })

  it('בלי כתובת נדחית', () => {
    expect(isValidMailbox({ email: '', label: 'תיבה' })).toBe(false)
  })
})

describe('mailboxKeyFor', () => {
  it('נגזר מהחלק המקומי של הכתובת', () => {
    expect(mailboxKeyFor('yerid2@chasamsofer.info')).toBe(`${CUSTOM_PREFIX}yerid2`)
  })

  it('תווים מיוחדים מוחלפים בקו תחתון', () => {
    expect(mailboxKeyFor('my.box-1@x.com')).toBe(`${CUSTOM_PREFIX}my_box_1`)
  })

  it('אותיות גדולות מנורמלות', () => {
    expect(mailboxKeyFor('Office@X.com')).toBe(`${CUSTOM_PREFIX}office`)
  })

  it('🔴 המפתח אינו מתנגש במחלקות הקבועות', () => {
    // התנגשות הייתה גורמת לתיבה החדשה לדרוס את הגדרות המחלקה הקיימת.
    const keys = Object.keys(DEPARTMENTS)
    for (const email of ['main@x.com', 'gemach@x.com', 'maternity@x.com']) {
      expect(keys).not.toContain(mailboxKeyFor(email))
    }
  })

  it('חלק מקומי בלי תווים חוקיים נופל לברירת מחדל', () => {
    expect(mailboxKeyFor('...@x.com')).toBe(`${CUSTOM_PREFIX}box`)
  })
})

describe('asDepartment', () => {
  it('מסומנת mailboxOnly — אינה מחלקה ארגונית', () => {
    // ⚠️ בלי זה אפשר היה לשייך איש צוות לתיבה שאינה מחלקה.
    const d = asDepartment({ key: 'custom_x', label: 'תיבה', email: 'x@y.com', color: '#000' })
    expect(d.mailboxOnly).toBe(true)
    expect(d.email).toBe('x@y.com')
    expect(d.label).toBe('תיבה')
  })
})
