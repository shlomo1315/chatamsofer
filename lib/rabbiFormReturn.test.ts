import { describe, it, expect } from 'vitest'
import {
  loanFormCode, rabbiFormSubject, looksLikeRabbiFormReturn, extractLoanFormCode,
} from './rabbiFormReturn'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הקוד שבנושא הוא עוגן הזיהוי כשכותרות השרשור נאכלות ב-dual-delivery.
// אם הוא לא שורד את המסע הלוך-חזור, הטופס החתום חוזר ולא משויך לאף בקשה —
// בדיוק כפי שקרה למשובי בתי ההחלמה.
// ─────────────────────────────────────────────────────────────────────────────

const LOAN_A = '3f8c1e42-9b7a-4d21-8e55-0c1a2b3d4e5f'
const LOAN_B = '7a2d9c11-4e6b-4f80-9a13-8b7c6d5e4f30'

describe('קוד הבקשה', () => {
  it('יציב — אותה בקשה מייצרת תמיד את אותו קוד', () => {
    // ⚠️ קריטי: הקוד נגזר מחדש בכל קליטה. קוד לא יציב היה מנתק את
    // הטופס החוזר מהבקשה שלו.
    expect(loanFormCode(LOAN_A)).toBe(loanFormCode(LOAN_A))
  })

  it('שונה בין בקשות', () => {
    expect(loanFormCode(LOAN_A)).not.toBe(loanFormCode(LOAN_B))
  })

  it('ללא תווים מבלבלים — הקוד מוקלד ידנית לפעמים', () => {
    // O/0, I/1, S/5 הוצאו מהאלפבית בכוונה.
    expect(loanFormCode(LOAN_A)).not.toMatch(/[OI0S15]/)
    expect(loanFormCode(LOAN_A)).toHaveLength(6)
  })
})

describe('מסע הלוך-חזור של הנושא', () => {
  it('הקוד שנשלח הוא הקוד שנחלץ בחזרה', () => {
    const subject = rabbiFormSubject(LOAN_A)
    expect(extractLoanFormCode(subject)).toBe(loanFormCode(LOAN_A))
  })

  it('שורד את קידומת ה-Reply של לקוח המייל', () => {
    // ⚠️ הטופס *תמיד* חוזר כתשובה, ולכן הנושא כמעט לעולם אינו נקי.
    const replied = `Re: ${rabbiFormSubject(LOAN_A)}`
    expect(looksLikeRabbiFormReturn(replied)).toBe(true)
    expect(extractLoanFormCode(replied)).toBe(loanFormCode(LOAN_A))
  })

  it('שורד תווי כיווניות שלקוחות מייל מוסיפים בעברית', () => {
    const rtlMangled = `‫Re: ${rabbiFormSubject(LOAN_A)}‬`
    expect(extractLoanFormCode(rtlMangled)).toBe(loanFormCode(LOAN_A))
  })

  it('מזהה החזרת טופס גם בלי קוד — שם נכנסת הנפילה-לאחור לפי השולח', () => {
    expect(looksLikeRabbiFormReturn('Re: טופס חתימת רב')).toBe(true)
    expect(extractLoanFormCode('Re: טופס חתימת רב')).toBeNull()
  })

  it('אינו תופס מיילים אחרים', () => {
    expect(looksLikeRabbiFormReturn('בקשת הלוואה')).toBe(false)
    expect(looksLikeRabbiFormReturn('משוב · בית החלמה')).toBe(false)
  })
})
