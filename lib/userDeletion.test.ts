import { describe, it, expect } from 'vitest'
import { isAlreadyGone, describeDeleteFailure } from './userDeletion'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מחיקת משתמש — שני כשלים אמיתיים שנצפו בפרודקשן.
//
// 1. "Database error deleting user" מ-GoTrue על משתמש שיש לו יותר מזהות
//    אחת (נרשם במייל ואז התחבר עם Google — אותה כתובת, שתי זהויות).
//
// 2. הפרופיל נמחק *לפני* Auth. כשהשלב השני נכשל, נשאר משתמש Auth בלי
//    פרופיל: הוא אינו מופיע ברשימת המשתמשים, אי אפשר למחוק אותו מהמסך,
//    והמייל שלו חסום ליצירה מחדש. מצב גרוע יותר מלא-למחוק-בכלל.
// ─────────────────────────────────────────────────────────────────────────────

describe('isAlreadyGone — מחיקה שכבר קרתה', () => {
  it('משתמש שאינו קיים אינו כשל', () => {
    expect(isAlreadyGone('User not found')).toBe(true)
    expect(isAlreadyGone('user does not exist')).toBe(true)
  })

  it('🔴 שגיאת מסד אמיתית *כן* כשל — אסור לבלוע אותה', () => {
    expect(isAlreadyGone('Database error deleting user')).toBe(false)
  })

  it('ריק אינו נחשב "כבר נמחק"', () => {
    expect(isAlreadyGone('')).toBe(false)
    expect(isAlreadyGone(null)).toBe(false)
  })
})

describe('describeDeleteFailure — 🔴 הודעה שאפשר לפעול לפיה', () => {
  it('שגיאת המסד מתורגמת להסבר על ריבוי זהויות', () => {
    const msg = describeDeleteFailure('Database error deleting user')
    expect(msg).toContain('זהויות')
  })

  it('⚠️ ההודעה המקורית נשמרת — בלעדיה אי אפשר לאבחן', () => {
    expect(describeDeleteFailure('Database error deleting user'))
      .toContain('Database error deleting user')
  })

  it('שגיאה אחרת מוחזרת כפי שהיא', () => {
    const msg = describeDeleteFailure('rate limit exceeded')
    expect(msg).toContain('rate limit exceeded')
  })
})
