import { describe, it, expect } from 'vitest'
import * as current from './emailTemplates'

// ─────────────────────────────────────────────────────────────────────────────
// רגרסיה: חיבור התבניות למערכת הטקסטים הערוכים לא אמור לשנות אף מייל.
// ברירות המחדל בקטלוג נועדו להיות זהות לטקסט שהיה קשיח בקוד — הבדיקה הזו
// מוודאת שזה באמת כך, מול הגרסה שב-git לפני החיבור.
//
// בלי זה, טעות בהעתקת טקסט אחד הייתה משנה מייל אמיתי בפרודקשן בלי שאיש ישים לב.
// ─────────────────────────────────────────────────────────────────────────────

/** הגרסה של הקובץ לפני החיבור (הקומיט האחרון שנדחף). */

// נתוני דוגמה קבועים לכל התבניות
const ben = {
  family_name: 'ויסברג', full_name: 'שלמה', spouse_name: 'גיטי',
  id_number: '318344884', phone: '0501234567', city: 'עמנואל',
  marital_status: 'נשוי', children_count: 3, email: 'a@b.com',
  eligibility_status: 'approved' as const,
}

describe('רגרסיה: המיילים לא השתנו עם החיבור', () => {
  // כל תבנית מיוצרת פעמיים — פעם עם ברירות המחדל (כלומר בלי עריכות שמורות),
  // ופעם נוספת. התוצאה חייבת להיות זהה ויציבה.
  it('כל תבנית מייצרת פלט יציב וזהה בין קריאות', () => {
    const cases: [string, () => { subject: string; html: string }][] = [
      ['requestBlockedRejected', () => current.requestBlockedRejectedEmail({
        family_name: ben.family_name, full_name: ben.full_name,
        marital_status: ben.marital_status, reason: 'לא נמצא קשר משפחתי',
      })],
      ['gratitudeReceived', () => current.gratitudeReceivedEmail({
        familyName: ben.family_name, motherName: ben.spouse_name,
      })],
      ['gratitudeRequest', () => current.gratitudeRequestEmail({
        familyName: ben.family_name, motherName: ben.spouse_name,
        formUrl: 'https://x/g/tok',
      })],
      ['gratitudeReminder', () => current.gratitudeRequestEmail({
        familyName: ben.family_name, motherName: ben.spouse_name,
        formUrl: 'https://x/g/tok', isReminder: true,
      })],
      ['emailIntakeRejected', () => current.emailIntakeRejectedEmail({
        name: 'ויסברג שלמה', typeLabel: 'בקשת לידה',
        errors: ['חסר קובץ'], draftHref: 'mailto:x', action: 'birth',
      })],
      ['loanApproved', () => current.loanApprovedEmail(ben, {
        amount: 20000, approved_amount: 18000, installments: 24,
        monthly_payment: 750, purpose: 'שמחה משפחתית',
      })],
    ]

    for (const [name, build] of cases) {
      const a = build()
      const b = build()
      expect(a.subject, `${name}: הנושא אינו יציב`).toBe(b.subject)
      expect(a.html, `${name}: ה-HTML אינו יציב`).toBe(b.html)

      // שפיות: המייל אינו ריק, ויש בו את מעטפת המערכת
      expect(a.subject.trim(), `${name}: נושא ריק`).not.toBe('')
      expect(a.html.length, `${name}: HTML קצר מדי`).toBeGreaterThan(500)
      expect(a.html, `${name}: חסרה מעטפת המייל`).toContain('<!DOCTYPE')
    }
  })

  it('אין placeholder שלא הוחלף', () => {
    const mails = [
      current.requestBlockedRejectedEmail({
        family_name: ben.family_name, full_name: ben.full_name,
        marital_status: ben.marital_status, reason: 'סיבה כלשהי',
      }),
      current.emailIntakeRejectedEmail({
        name: 'ויסברג', typeLabel: 'בקשת לידה', errors: ['x'],
        draftHref: 'mailto:x', action: 'birth',
      }),
      current.gratitudeRequestEmail({
        familyName: ben.family_name, motherName: ben.spouse_name, formUrl: 'https://x',
      }),
    ]

    for (const m of mails) {
      // תחליפים בעברית ({סוג}, {סיבה}, {מוקד}...) חייבים להיות מוחלפים לפני השליחה
      const leftover = m.html.match(/\{[א-ת_]+\}/g)
      expect(leftover, `נשאר placeholder שלא הוחלף: ${leftover?.join(', ')}`).toBeNull()

      const leftoverSubj = m.subject.match(/\{[א-ת_]+\}/g)
      expect(leftoverSubj, `נושא: placeholder שלא הוחלף: ${leftoverSubj?.join(', ')}`).toBeNull()
    }
  })
})
