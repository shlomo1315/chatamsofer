import { describe, it, expect } from 'vitest'
import {
  isAwaitingReply, isReturnedFromInquiry, showsInPendingList,
} from './maternityInquiryState'

// 🔴 תיק שנשלח אליו בירור תפס מקום ברשימת "ממתין לאישור" למרות שאין מה
// לעשות איתו, ותשובת היולדת נבלעה בלי שאיש ידע שהיא הגיעה.
//
// ⚠️ בניגוד להלוואות אין כאן סטטוס inquiry — ההבחנה נגזרת משרשור
// ההודעות בלבד.

describe('תיק שממתין לתשובת היולדת', () => {
  it('🔴 יורד מרשימת ההמתנה', () => {
    // הכדור אצלה. בלי זה התיק נראה כמשימה פתוחה בזמן שאין מה לעשות.
    expect(showsInPendingList({ lastDirection: 'staff' })).toBe(false)
    expect(isAwaitingReply({ lastDirection: 'staff' })).toBe(true)
  })

  it('אינו נחשב "חזר מבירור"', () => {
    expect(isReturnedFromInquiry({ lastDirection: 'staff' })).toBe(false)
  })
})

describe('תיק שהיולדת השיבה בו', () => {
  it('🔴 חוזר לרשימה עם תווית', () => {
    expect(showsInPendingList({ lastDirection: 'applicant' })).toBe(true)
    expect(isReturnedFromInquiry({ lastDirection: 'applicant' })).toBe(true)
  })

  it('אינו נחשב "ממתין לתשובה"', () => {
    expect(isAwaitingReply({ lastDirection: 'applicant' })).toBe(false)
  })
})

describe('תיק בלי שרשור בירור', () => {
  it('⚠️ מוצג ברשימה כרגיל — רוב התיקים כאלה', () => {
    // ברירת מחדל שמסתירה הייתה מרוקנת את כל הרשימה.
    expect(showsInPendingList({})).toBe(true)
    expect(showsInPendingList({ lastDirection: null })).toBe(true)
    expect(showsInPendingList({ lastDirection: undefined })).toBe(true)
  })

  it('אינו מקבל תווית "חזר מבירור"', () => {
    expect(isReturnedFromInquiry({})).toBe(false)
    expect(isReturnedFromInquiry({ lastDirection: null })).toBe(false)
  })
})

describe('⚠️ ערך לא צפוי אינו מסתיר תיק', () => {
  it('כיוון לא מוכר נחשב "מוצג"', () => {
    // 🔴 ההטיה כאן מכוונת: תיק שנעלם בטעות אינו מטופל, וזה גרוע
    // מתיק שמוצג לשווא.
    expect(showsInPendingList({ lastDirection: 'unknown' })).toBe(true)
    expect(showsInPendingList({ lastDirection: '' })).toBe(true)
  })
})
