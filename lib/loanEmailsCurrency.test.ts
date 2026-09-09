import { describe, it, expect } from 'vitest'
import { loanApprovedEmail, weeklyLoansReportEmail } from './emailTemplates'
import { templateLoanApproved } from './email'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 אגף ההלוואות כולו נקוב בדולרים — בשום מייל לא מופיע ₪.
//
// ⚠️ לווה שביקש $10,000 קיבל אישור על "10,000 ₪" — פער של פי 3.5. הלווים
// פנו במייל לשאול למה אושר להם סכום כה קטן.
//
// 🔴 הטסט הזה סורק את ה-HTML כולו ולא שדה בודד: הפורמט שוכפל בכל תבנית
// בנפרד, ולכן תיקון במקום אחד לא הגיע לשאר. סריקה של הפלט המלא היא
// הדרך היחידה לתפוס תבנית חדשה שתיכתב מחר עם ₪.
//
// ⚠️ סיוע רפואי, חלוקות חגים ויולדות *כן* בשקלים — הם אינם נבדקים כאן.
// ─────────────────────────────────────────────────────────────────────────────

const ben = {
  family_name: 'כהן', full_name: 'ישראל', id_number: '123456789',
  marital_status: 'נשואים', phone: '050-1234567', city: 'בני ברק',
}

describe('🔴 מיילי הלוואות — דולר בלבד', () => {
  it('אישור הלוואה — הסכום בדולר, בלי ₪', () => {
    const html = loanApprovedEmail(ben, {
      amount: 10000, approved_amount: 10000, installments: 20,
      monthly_payment: 500, purpose: 'חתונה',
    }).html
    expect(html).toContain('$10,000')
    expect(html).not.toContain('₪')
  })

  it('🔴 סכום שאושר גובר על המבוקש — ובדולר', () => {
    const html = loanApprovedEmail(ben, { amount: 10000, approved_amount: 7500 }).html
    expect(html).toContain('$7,500')
    expect(html).not.toContain('₪')
  })

  it('דוח ההלוואות השבועי — בלי ₪', () => {
    const html = weeklyLoansReportEmail({
      pending: 3, awaitingDisbursement: 2, disbursedThisWeek: 5,
      newLoans: [{
        id: 'x', amount: 10000, borrowerName: 'כהן ישראל',
        purpose: 'חתונה', createdAt: '2026-09-01',
      } as never],
    }, 'https://example.com').html
    expect(html).not.toContain('₪')
  })

  it('תבנית האישור הישנה — גם היא בדולר', () => {
    const html = templateLoanApproved('ישראל', 10000).html
    expect(html).toContain('$10,000')
    expect(html).not.toContain('₪')
  })
})
