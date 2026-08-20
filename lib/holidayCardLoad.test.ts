import { describe, it, expect } from 'vitest'
import { eligibleForLoad, DEFAULT_LOAD_AMOUNT } from './holidayCardLoad'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 כל שורה שעוברת את הסינון הזה = 500₪ שיוצאים מהתקציב.
//
// ⚠️ טעות כאן אינה באג בתצוגה: היא טעינה כפולה, או טעינה למי שלא אושר.
// ─────────────────────────────────────────────────────────────────────────────

const row = (over: Partial<Parameters<typeof eligibleForLoad>[0][0]> = {}) => ({
  id: 'r1', approval_status: 'approved', load_status: null,
  id_number: '123456789', name: 'משפחת ישראלי', ...over,
})

describe('eligibleForLoad — מי מקבל טעינה', () => {
  it('מאושר, טרם נטען, עם ת"ז — זכאי', () => {
    expect(eligibleForLoad([row()])).toHaveLength(1)
  })

  it('🔴 מי שלא אושר אינו נטען', () => {
    expect(eligibleForLoad([row({ approval_status: 'pending' })])).toHaveLength(0)
    expect(eligibleForLoad([row({ approval_status: 'rejected' })])).toHaveLength(0)
  })

  it('🔴 מי שכבר נטען אינו נטען שוב', () => {
    // ⚠️ זו ההגנה מפני טעינה כפולה — 500₪ נוספים לכל שורה.
    expect(eligibleForLoad([row({ load_status: 'loaded' })])).toHaveLength(0)
  })

  it('מי שנכשל בטעינה קודמת — כן נכלל בנסיון חוזר', () => {
    // כשל זמני (רשת, חסימת קצב) אינו סיבה לוותר על המשפחה.
    expect(eligibleForLoad([row({ load_status: 'failed' })])).toHaveLength(1)
  })

  it('🔴 בלי תעודת זהות אין את מי לחפש בנדרים', () => {
    expect(eligibleForLoad([row({ id_number: null })])).toHaveLength(0)
    expect(eligibleForLoad([row({ id_number: '  ' })])).toHaveLength(0)
  })

  it('מסנן רשימה מעורבת נכון', () => {
    const targets = eligibleForLoad([
      row({ id: 'a' }),
      row({ id: 'b', approval_status: 'pending' }),
      row({ id: 'c', load_status: 'loaded' }),
      row({ id: 'd', id_number: null }),
      row({ id: 'e', load_status: 'failed' }),
    ])
    expect(targets.map(t => t.recipientId)).toEqual(['a', 'e'])
  })

  it('מעביר ת"ז ושם ליעד', () => {
    const [t] = eligibleForLoad([row({ id_number: '987654321', name: 'כהן' })])
    expect(t).toEqual({ recipientId: 'r1', idNumber: '987654321', name: 'כהן' })
  })

  it('רשימה ריקה אינה קורסת', () => {
    expect(eligibleForLoad([])).toEqual([])
  })
})

describe('DEFAULT_LOAD_AMOUNT', () => {
  it('500 ש"ח כברירת מחדל', () => {
    expect(DEFAULT_LOAD_AMOUNT).toBe(500)
  })
})
