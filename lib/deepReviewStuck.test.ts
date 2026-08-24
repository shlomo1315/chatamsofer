import { describe, it, expect } from 'vitest'
import { isDeepReviewStuck, type DeepReviewState } from './deepReviewStuck'

// 🔴 165 משפחות נמצאו תקועות ב"בדיקה מעמיקה" בלי שאף תנאי מתקיים אצלן:
// צומת בדור 7-9, בלי צמתים שנוספו, בלי סיבה שמזכיר כתב. הדגל נקבע פעם
// אחת ברישום ולעולם לא התנקה.

const base: DeepReviewState = {
  status: 'deep_review', generation: 8, manualCount: 0, reason: null,
}

describe('isDeepReviewStuck', () => {
  it('🔴 דור 8 בלי צמתים ובלי סיבה — תקוע', () => {
    // המקרה של 165 המשפחות.
    expect(isDeepReviewStuck(base)).toBe(true)
  })

  it('⚠️ סיבה שנכתבה ידנית — לא נוגעים', () => {
    // המזכיר החליט להעביר, וזו החלטה אנושית שאין לבטל אוטומטית.
    expect(isDeepReviewStuck({ ...base, reason: 'סדר הדורות דורש בירור' })).toBe(false)
  })

  it('⚠️ הנרשם הוסיף צמתים — הסטייה אמיתית', () => {
    expect(isDeepReviewStuck({ ...base, manualCount: 2 })).toBe(false)
  })

  it('🔴 דור רדוד — הדגל לגיטימי', () => {
    // זה בדיוק התנאי שהכלל נועד לתפוס.
    expect(isDeepReviewStuck({ ...base, generation: 3 })).toBe(false)
    expect(isDeepReviewStuck({ ...base, generation: 4 })).toBe(false)
  })

  it('דור 5 בדיוק — מעל הסף, תקוע', () => {
    expect(isDeepReviewStuck({ ...base, generation: 5 })).toBe(true)
  })

  it('⚠️ בלי שיוך לצומת — לא משחררים', () => {
    // שחרור על סמך חוסר מידע היה מסתיר משפחה שדווקא כן חורגת.
    expect(isDeepReviewStuck({ ...base, generation: null })).toBe(false)
  })

  it('סטטוס אחר — אינו רלוונטי', () => {
    expect(isDeepReviewStuck({ ...base, status: 'pending' })).toBe(false)
    expect(isDeepReviewStuck({ ...base, status: 'approved' })).toBe(false)
  })

  it('סיבה של רווחים בלבד נחשבת ריקה', () => {
    expect(isDeepReviewStuck({ ...base, reason: '   ' })).toBe(true)
  })
})
