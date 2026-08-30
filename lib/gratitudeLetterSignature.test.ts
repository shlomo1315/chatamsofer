import { describe, it, expect } from 'vitest'
import {
  benOf, voucherInputFromRow, GRATITUDE_LETTER_SELECT,
  type GratitudeLetterRow,
} from '@/app/api/admin/gratitude/[id]/shared'

// 🔴 מכתב ברכה שאינו מקושר לתיק לידה (maternity_aid_id = NULL) אך כן מקושר
// ישירות למוטב (beneficiary_id). 29 מכתבים אמיתיים במסד היו במצב הזה,
// והחתימה יצאה ריקה — קו מקווקו במקום שם המשפחה, בבודד ובמרוכז כאחד.
const rowWithoutAid = {
  id: 'x', body: 'תודה רבה', signature: null, is_anonymous: false,
  status: 'approved', created_at: '2026-07-28T00:00:00Z',
  aid: null,
  letterBen: {
    family_name: 'בירנצויג', full_name: 'חיים משה', spouse_name: 'שרה',
    city: 'מודיעין עילית', address: 'הרב קוק 5',
    id_number: '123456789', spouse_id_number: '987654321', email: 'a@b.c',
  },
} as unknown as GratitudeLetterRow

// מכתב רגיל — המשפחה מגיעה דרך תיק הלידה. חייב להמשיך לעבוד כרגיל.
const rowWithAid = {
  id: 'y', body: 'תודה', signature: null, is_anonymous: false,
  status: 'approved', created_at: '2026-07-28T00:00:00Z',
  aid: {
    birth_date: '2026-07-01', recovery_home: 'בית החלמה',
    recovery_eligibility_days: 2, is_twins: false,
    beneficiary: { family_name: 'כהן', full_name: 'יעקב', spouse_name: 'רחל', city: 'ירושלים' },
  },
  letterBen: null,
} as unknown as GratitudeLetterRow

describe('חתימת מכתב ברכה — נפילה למוטב המקושר ישירות', () => {
  it('השאילתה שולפת גם את המוטב הישיר', () => {
    expect(GRATITUDE_LETTER_SELECT).toMatch(/letterBen:beneficiaries!beneficiary_id/)
  })

  it('benOf מוצא את המשפחה גם כשאין תיק לידה', () => {
    expect(benOf(rowWithoutAid)?.family_name).toBe('בירנצויג')
  })

  it('החתימה, הת"ז והכתובת מגיעות לשובר גם בלי תיק לידה', () => {
    const input = voucherInputFromRow(rowWithoutAid)
    expect(input.familyName).toBe('בירנצויג')
    expect(input.husbandName).toBe('חיים משה')
    expect(input.wifeName).toBe('שרה')
    expect(input.city).toBe('מודיעין עילית')
    expect(input.street).toBe('הרב קוק 5')
    expect(input.husbandId).toBe('123456789')
    expect(input.wifeId).toBe('987654321')
  })

  it('תיק הלידה נשאר מקור העדיפות כשהוא קיים', () => {
    expect(benOf(rowWithAid)?.family_name).toBe('כהן')
    expect(voucherInputFromRow(rowWithAid).city).toBe('ירושלים')
  })
})
