import { describe, it, expect } from 'vitest'
import { caseKey, isClosed } from './lineageCaseKey'

const A = '019d98e5-f358-4ccd-84e9-c6f3b6de05e1'
const B = '9612ad05-02bf-4c89-99bc-eee52cbbf654'
const C = '619e21ad-ba51-4700-bcb4-38920a00465a'

describe('caseKey — יציבות המפתח', () => {
  // 🔴 הליבה: בלי מיון, דחיית זוג (א,ב) לא הייתה חלה על (ב,א),
  // והמקרה היה חוזר ברשימה אחרי שכבר הוכרע.
  it('סדר הצמתים אינו משנה את המפתח', () => {
    expect(caseKey('duplicate', [A, B])).toBe(caseKey('duplicate', [B, A]))
  })

  it('שלושה צמתים — כל סדר נותן אותו מפתח', () => {
    const k = caseKey('duplicate', [A, B, C])
    expect(caseKey('duplicate', [C, A, B])).toBe(k)
    expect(caseKey('duplicate', [B, C, A])).toBe(k)
  })

  it('סוג שונה = מקרה שונה על אותם צמתים', () => {
    expect(caseKey('duplicate', [A, B])).not.toBe(caseKey('many_children', [A, B]))
  })

  it('צמתים שונים = מפתח שונה', () => {
    expect(caseKey('duplicate', [A, B])).not.toBe(caseKey('duplicate', [A, C]))
  })

  it('רישיות ורווחים אינם משנים זהות', () => {
    expect(caseKey('duplicate', [A.toUpperCase(), ` ${B} `])).toBe(caseKey('duplicate', [A, B]))
  })

  // ⚠️ מזהה ריק נובע מנתון חסר, לא ממקרה אחר — אחרת ההכרעה "תאבד"
  // ברגע שצומת נמחק והרשימה תיראה כאילו לא הוכרעה.
  it('מזהים ריקים מסוננים', () => {
    expect(caseKey('duplicate', [A, null, B, undefined, ''])).toBe(caseKey('duplicate', [A, B]))
  })

  it('רשימה ריקה אינה קורסת', () => {
    expect(caseKey('unlinked', [])).toBe('unlinked:')
  })
})

describe('isClosed — מה יורד מרשימת הפתוחים', () => {
  it('טופל ונדחה נסגרים', () => {
    expect(isClosed('resolved')).toBe(true)
    expect(isClosed('dismissed')).toBe(true)
  })

  // ⚠️ "לטיפול בהמשך" נשאר פתוח בכוונה — הוא סימון עדיפות, לא סגירה.
  it('"לטיפול בהמשך" נשאר פתוח', () => {
    expect(isClosed('later')).toBe(false)
  })

  it('מקרה שלא הוכרע פתוח', () => {
    expect(isClosed(null)).toBe(false)
    expect(isClosed(undefined)).toBe(false)
  })
})
