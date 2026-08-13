import { describe, it, expect } from 'vitest'
import {
  OPEN_LOAN_STATUSES, AWAITING_RABBI_FORM, openLoanMessageFor, openLoanEmailReason,
} from './openLoanGuard'

// ─────────────────────────────────────────────────────────────────────────────
// חסימת בקשה כפולה — הכללים שקל לשבור בלי לשים לב.
// ─────────────────────────────────────────────────────────────────────────────

const loan = (status: string) => ({
  id: 'l1', status, amount: 5000, created_at: '2026-08-01T00:00:00.000Z',
})

describe('אילו סטטוסים חוסמים בקשה נוספת', () => {
  it('הלוואה מאושרת עדיין חוסמת — עד לביצוע בפועל', () => {
    // 🔴 הכלל: אישור אינו סוף התהליך. בין האישור למסירת הכסף המבקש
    // עדיין ממתין, ובחלון הזה אסור שתיפתח בקשה שנייה במקביל.
    expect(OPEN_LOAN_STATUSES).toContain('approved')
  })

  it('ממתין ובירור חוסמים', () => {
    expect(OPEN_LOAN_STATUSES).toContain('pending')
    expect(OPEN_LOAN_STATUSES).toContain('inquiry')
  })

  it('הלוואה שבוצעה משחררת', () => {
    // active/completed = הכסף נמסר והתיק עבר לשלב ההחזר.
    expect(OPEN_LOAN_STATUSES).not.toContain('active')
    expect(OPEN_LOAN_STATUSES).not.toContain('completed')
  })

  it('בקשה שנדחתה אינה חוסמת', () => {
    expect(OPEN_LOAN_STATUSES).not.toContain('rejected')
  })

  it('טיוטה שממתינה לטופס חתימת רב אינה חוסמת', () => {
    // 🔴 אחרת המבקש ננעל מחוץ לטיוטה של עצמו: לא יכול להשלים אותה
    // ולא יכול להתחיל חדשה.
    expect(OPEN_LOAN_STATUSES).not.toContain(AWAITING_RABBI_FORM)
  })
})

describe('נוסח ההודעה תואם את מצב הבקשה', () => {
  it('בקשה שאושרה — "ממתינה לביצוע", לא "ממתינה להחלטה"', () => {
    // ⚠️ שליחת "עדיין בתהליך בירור" למי שכבר קיבל מכתב אישור סותרת
    // את מה שאמרנו לו.
    const msg = openLoanMessageFor(loan('approved'))
    expect(msg).toContain('ביצוע')
    expect(msg).not.toContain('בירור')
  })

  it('בקשה שממתינה — הנוסח המקורי', () => {
    expect(openLoanMessageFor(loan('pending'))).toContain('בירור')
  })

  it('תשובת המייל מבחינה בין השניים', () => {
    expect(openLoanEmailReason(loan('approved'))).toContain('אושרה')
    expect(openLoanEmailReason(loan('pending'))).toContain('בירור')
  })

  it('תשובת המייל כוללת סכום ותאריך לזיהוי הבקשה', () => {
    const r = openLoanEmailReason(loan('pending'))
    expect(r).toContain('5,000')
    expect(r).toMatch(/\d{1,2}\.\d{1,2}\.\d{4}/)
  })
})
