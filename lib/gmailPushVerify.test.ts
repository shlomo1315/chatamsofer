import { describe, it, expect } from 'vitest'
import { tokenMatches, decodePush, isStaleNotification } from './gmailPushVerify'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ הנתיב הזה ציבורי, וכל מי שמנחש אותו יכול לשגר אליו התראות. הבדיקות
// כאן נעולות על נכשל-סגור: מה שלא אומת — לא מטופל.
// ─────────────────────────────────────────────────────────────────────────────

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64')

describe('🔴 tokenMatches — נכשל-סגור', () => {
  it('טוקן תואם', () => {
    expect(tokenMatches('sod-arok-123', 'sod-arok-123')).toBe(true)
  })

  it('טוקן שגוי נדחה', () => {
    expect(tokenMatches('לא-נכון', 'sod-arok-123')).toBe(false)
  })

  it('🔴 סוד שלא הוגדר אינו מתיר הכל', () => {
    // בלי זה, שכחה להגדיר משתנה סביבה הייתה פותחת את הנתיב לכולם בשקט.
    expect(tokenMatches('', '')).toBe(false)
    expect(tokenMatches('כל-דבר', '')).toBe(false)
    expect(tokenMatches('כל-דבר', null)).toBe(false)
    expect(tokenMatches('כל-דבר', undefined)).toBe(false)
  })

  it('טוקן חסר נדחה', () => {
    expect(tokenMatches(null, 'sod')).toBe(false)
    expect(tokenMatches(undefined, 'sod')).toBe(false)
    expect(tokenMatches('', 'sod')).toBe(false)
  })

  it('אורך שונה נדחה', () => {
    expect(tokenMatches('sod', 'sod-arok')).toBe(false)
  })
})

describe('decodePush — פענוח המעטפה', () => {
  it('מחלץ כתובת ו-historyId', () => {
    const env = { message: { data: b64({ emailAddress: 'Igud@X.com', historyId: '12345' }) } }
    expect(decodePush(env)).toEqual({ emailAddress: 'igud@x.com', historyId: '12345' })
  })

  it('historyId מספרי מומר למחרוזת', () => {
    const env = { message: { data: b64({ emailAddress: 'a@b.com', historyId: 999 }) } }
    expect(decodePush(env)?.historyId).toBe('999')
  })

  it('🔴 מעטפה פגומה מחזירה null ואינה זורקת', () => {
    // גוגל מפרש שגיאה כ"לא נמסר" ומנסה שוב ימים. הודעה פגומה שמפילה את
    // הנתיב חוזרת אלינו אלפי פעמים.
    expect(decodePush(null)).toBeNull()
    expect(decodePush({})).toBeNull()
    expect(decodePush({ message: {} })).toBeNull()
    expect(decodePush({ message: { data: 'לא-base64-תקין!!!' } })).toBeNull()
  })

  it('חסרים שדות — נדחה', () => {
    expect(decodePush({ message: { data: b64({ emailAddress: 'a@b.com' }) } })).toBeNull()
    expect(decodePush({ message: { data: b64({ historyId: '1' }) } })).toBeNull()
    expect(decodePush({ message: { data: b64({}) } })).toBeNull()
  })
})

describe('🔴 isStaleNotification — Pub/Sub מוסר יותר מפעם אחת', () => {
  it('התראה חדשה מטופלת', () => {
    expect(isStaleNotification('200', '100')).toBe(false)
  })

  it('🔴 אותה התראה בדיוק נחשבת ישנה', () => {
    // בלי זה כל מסירה חוזרת מפעילה סנכרון ושורפת מכסת API.
    expect(isStaleNotification('100', '100')).toBe(true)
  })

  it('התראה ישנה יותר נדחית', () => {
    expect(isStaleNotification('50', '100')).toBe(true)
  })

  it('סנכרון ראשון — אין ממה להשוות', () => {
    expect(isStaleNotification('100', null)).toBe(false)
    expect(isStaleNotification('100', undefined)).toBe(false)
    expect(isStaleNotification('100', '')).toBe(false)
  })

  it('🔴 ההשוואה מספרית ולא טקסטואלית', () => {
    // כמחרוזות "9" > "10", ולכן התראה חדשה הייתה נדחית כישנה.
    expect(isStaleNotification('10', '9')).toBe(false)
    expect(isStaleNotification('9', '10')).toBe(true)
  })

  it('מספרים גדולים מאוד (historyId אמיתי)', () => {
    expect(isStaleNotification('9007199254740993', '9007199254740992')).toBe(false)
  })

  it('ערך לא מספרי אינו מפיל', () => {
    expect(() => isStaleNotification('לא-מספר', '100')).not.toThrow()
  })
})
