import { describe, it, expect } from 'vitest'
import {
  isFreshTodo, isReturned, isSentPending, isTodo, isApproved, isRejected,
  matchesLoanFilter, matchesTodoSub, countLoanCategories,
  type LoanCategoryInput,
} from './loansListFilter'

// 🔴 הטסטים כאן שומרים על ההבחנה שהכי קל לשבור בה את המסך: בקשה שהמבקש
// השיב עליה חייבת לעבור מ"נשלח לבירור" ל"ממתין לטיפול". אם היא נשארת
// ב"נשלח", מזכירה רואה אותה כאילו ממתינים למבקש — והבקשה נתקעת.

const loan = (status: string, lastDir?: string | null): LoanCategoryInput => ({ status, lastDir })

describe('קטגוריות ההלוואות', () => {
  it('בקשה חדשה שטרם טופלה היא "ראשוני" וגם "ממתין לטיפול"', () => {
    const l = loan('pending')
    expect(isFreshTodo(l)).toBe(true)
    expect(isTodo(l)).toBe(true)
    expect(isSentPending(l)).toBe(false)
  })

  it('נשלח בירור והמבקש טרם ענה — הכדור אצלו', () => {
    const l = loan('inquiry', 'staff')
    expect(isSentPending(l)).toBe(true)
    expect(isReturned(l)).toBe(false)
    expect(isTodo(l)).toBe(false)
  })

  it('🔴 המבקש ענה — הבקשה חוזרת לטיפולנו ויוצאת מ"נשלח לבירור"', () => {
    const l = loan('inquiry', 'applicant')
    expect(isReturned(l)).toBe(true)
    expect(isTodo(l)).toBe(true)
    expect(isSentPending(l)).toBe(false)
  })

  it('בירור בלי הודעות כלל נחשב "נשלח" ולא "חזר"', () => {
    const l = loan('inquiry', null)
    expect(isSentPending(l)).toBe(true)
    expect(isReturned(l)).toBe(false)
  })

  it('אושר/נדחה אינם נספרים כממתינים', () => {
    expect(isTodo(loan('approved'))).toBe(false)
    expect(isTodo(loan('rejected'))).toBe(false)
  })

  it('⚠️ הלוואה בביצוע/שהסתיימה נחשבת "אושרה" — אחרת היא נעלמת מהלשונית', () => {
    for (const s of ['approved', 'active', 'completed']) {
      expect(isApproved(loan(s))).toBe(true)
      expect(isRejected(loan(s))).toBe(false)
    }
  })

  it('⚠️ הלוואה שלא נפרעה (defaulted) נחשבת "נדחתה"', () => {
    for (const s of ['rejected', 'defaulted']) {
      expect(isRejected(loan(s))).toBe(true)
      expect(isApproved(loan(s))).toBe(false)
    }
  })
})

describe('התאמת פילטר', () => {
  const rows = [
    loan('pending'),
    loan('inquiry', 'applicant'),
    loan('inquiry', 'staff'),
    loan('approved'),
    loan('rejected'),
  ]

  it('"הכל" מחזיר את כל השורות', () => {
    expect(rows.filter(l => matchesLoanFilter(l, 'all'))).toHaveLength(5)
  })

  it('"ממתין לטיפול" = ראשוני + חזר מבירור', () => {
    expect(rows.filter(l => matchesLoanFilter(l, 'todo'))).toHaveLength(2)
  })

  it('תת-הסינון מפריד בין ראשוני לחזר-מבירור', () => {
    const todo = rows.filter(l => matchesLoanFilter(l, 'todo'))
    expect(todo.filter(l => matchesTodoSub(l, 'fresh'))).toHaveLength(1)
    expect(todo.filter(l => matchesTodoSub(l, 'returned'))).toHaveLength(1)
    expect(todo.filter(l => matchesTodoSub(l, 'all'))).toHaveLength(2)
  })
})

describe('מונים', () => {
  it('todo הוא בדיוק סכום fresh ו-returned — הקטגוריות אינן זרות', () => {
    const rows = [
      loan('pending'), loan('pending'),
      loan('inquiry', 'applicant'),
      loan('inquiry', 'staff'),
      loan('approved'),
    ]
    const c = countLoanCategories(rows)
    expect(c.fresh).toBe(2)
    expect(c.returned).toBe(1)
    expect(c.todo).toBe(c.fresh + c.returned)
    expect(c.sent).toBe(1)
    expect(c.all).toBe(5)
  })

  it('⚠️ המונה תואם בדיוק את מה שהפילטר מחזיר — אחרת הלשונית משקרת', () => {
    const rows = [
      loan('pending'), loan('inquiry', 'applicant'), loan('inquiry', 'staff'),
      loan('approved'), loan('rejected'), loan('pending'),
    ]
    const c = countLoanCategories(rows)
    // כל מונה נבדק מול ספירת הפילטר עצמו — זו ההגנה מפני שני מימושים שנפרדו
    expect(c.all).toBe(rows.filter(l => matchesLoanFilter(l, 'all')).length)
    expect(c.todo).toBe(rows.filter(l => matchesLoanFilter(l, 'todo')).length)
    expect(c.sent).toBe(rows.filter(l => matchesLoanFilter(l, 'sent')).length)
    expect(c.approved).toBe(rows.filter(l => matchesLoanFilter(l, 'approved')).length)
    expect(c.rejected).toBe(rows.filter(l => matchesLoanFilter(l, 'rejected')).length)
  })

  it('רשימה ריקה מחזירה אפסים ולא NaN', () => {
    expect(countLoanCategories([])).toEqual({
      all: 0, todo: 0, fresh: 0, returned: 0, sent: 0, approved: 0, rejected: 0,
    })
  })
})
