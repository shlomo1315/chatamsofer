import { describe, it, expect } from 'vitest'
import {
  matchesBatch, selectBatch, batchStats, wasSentToDonor, dayOf, rangeLabel,
  type BatchLetter,
} from './gratitudeBatch'

// ⚠️ מה שנבדק כאן הוא ההסכמה בין התצוגה המקדימה, כותרת ה-PDF וההורדה.
// כשהם חלוקים, המשתמש מוריד קובץ שאינו תואם למה שהמסך הבטיח לו.

const L = (o: Partial<BatchLetter> & { id: string }): BatchLetter => ({
  status: 'approved', created_at: '2026-08-10T09:00:00Z', sent_to_donor_at: null, ...o,
})

describe('"נשלח לנדיב"', () => {
  it('🔴 נקבע לפי sent_to_donor_at ולא לפי סטטוס', () => {
    // ברכה מאושרת שטרם נשלחה היא בדיוק מה שהמשלוח השבועי מחפש.
    expect(wasSentToDonor(L({ id: 'a', status: 'approved' }))).toBe(false)
    expect(wasSentToDonor(L({ id: 'b', sent_to_donor_at: '2026-08-11T10:00:00Z' }))).toBe(true)
  })

  it('⚠️ מחרוזת ריקה או רווחים = טרם נשלחה', () => {
    expect(wasSentToDonor(L({ id: 'c', sent_to_donor_at: '' }))).toBe(false)
    expect(wasSentToDonor(L({ id: 'd', sent_to_donor_at: '  ' }))).toBe(false)
  })
})

describe('סינון "טרם נשלחו"', () => {
  const unsent = L({ id: 'u' })
  const sent = L({ id: 's', sent_to_donor_at: '2026-08-11T10:00:00Z' })

  it('🔴 מחזיר רק את מי שטרם נשלחה', () => {
    expect(matchesBatch(unsent, { sent: 'unsent' })).toBe(true)
    expect(matchesBatch(sent, { sent: 'unsent' })).toBe(false)
  })

  it('"נשלחו" הוא ההפך המדויק', () => {
    expect(matchesBatch(sent, { sent: 'sent' })).toBe(true)
    expect(matchesBatch(unsent, { sent: 'sent' })).toBe(false)
  })

  it('ברירת המחדל כוללת את שניהם', () => {
    expect(matchesBatch(unsent, {})).toBe(true)
    expect(matchesBatch(sent, {})).toBe(true)
  })
})

describe('טווח תאריכים', () => {
  const l = L({ id: 'x', created_at: '2026-08-10T21:30:00Z' })

  it('🔴 גבולות הטווח כוללים את היום עצמו', () => {
    // ⚠️ ברכה מה-10 חייבת להיכנס לטווח 10—10, אחרת שבוע שלם נופל.
    expect(matchesBatch(l, { from: '2026-08-10', to: '2026-08-10' })).toBe(true)
  })

  it('🔴 שעת ערב אינה מזיזה את היום', () => {
    // התאריך במסד ב-UTC; המרה ל-Date מקומי הייתה מזיזה 21:30 ליום אחר.
    expect(dayOf(l)).toBe('2026-08-10')
    expect(matchesBatch(l, { from: '2026-08-10' })).toBe(true)
    expect(matchesBatch(l, { to: '2026-08-10' })).toBe(true)
  })

  it('מחוץ לטווח — יוצא', () => {
    expect(matchesBatch(l, { from: '2026-08-11' })).toBe(false)
    expect(matchesBatch(l, { to: '2026-08-09' })).toBe(false)
  })

  it('⚠️ ברכה בלי תאריך נכללת רק כשאין טווח', () => {
    // אחרת היא נופלת בשקט ממסמך שסונן לפי תאריכים.
    const noDate = L({ id: 'n', created_at: null })
    expect(matchesBatch(noDate, {})).toBe(true)
    expect(matchesBatch(noDate, { from: '2026-08-01' })).toBe(false)
  })
})

describe('סינון סטטוס', () => {
  it('מאושרות בלבד', () => {
    expect(matchesBatch(L({ id: 'a', status: 'approved' }), { status: 'approved' })).toBe(true)
    expect(matchesBatch(L({ id: 'b', status: 'received' }), { status: 'approved' })).toBe(false)
    expect(matchesBatch(L({ id: 'c', status: 'rejected' }), { status: 'approved' })).toBe(false)
  })
})

describe('סינונים מצטברים', () => {
  it('🔴 "מאושרות שטרם נשלחו בשבוע האחרון" — כל השלושה יחד', () => {
    const hit = L({ id: 'hit', status: 'approved', created_at: '2026-08-10T09:00:00Z' })
    const wrongStatus = L({ id: 'ws', status: 'received', created_at: '2026-08-10T09:00:00Z' })
    const alreadySent = L({ id: 'as', created_at: '2026-08-10T09:00:00Z', sent_to_donor_at: '2026-08-11T00:00:00Z' })
    const outOfRange = L({ id: 'or', created_at: '2026-07-01T09:00:00Z' })
    const f = { from: '2026-08-09', to: '2026-08-15', sent: 'unsent' as const, status: 'approved' as const }
    expect(matchesBatch(hit, f)).toBe(true)
    expect(matchesBatch(wrongStatus, f)).toBe(false)
    expect(matchesBatch(alreadySent, f)).toBe(false)
    expect(matchesBatch(outOfRange, f)).toBe(false)
  })
})

describe('סדר הקובץ', () => {
  it('🔴 כרונולוגי עולה — ישן→חדש', () => {
    // ⚠️ הפוך מהרשימה במסך: במסמך מודפס קוראים מלמעלה למטה.
    const rows = [
      L({ id: 'c', created_at: '2026-08-12T00:00:00Z' }),
      L({ id: 'a', created_at: '2026-08-10T00:00:00Z' }),
      L({ id: 'b', created_at: '2026-08-11T00:00:00Z' }),
    ]
    expect(selectBatch(rows, {}).map(r => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('⚠️ תאריך זהה — סדר יציב לפי id', () => {
    // בלי שובר שוויון הסדר משתנה בין הרצות, והקובץ אינו ניתן לשחזור.
    const rows = [L({ id: 'z' }), L({ id: 'a' })]
    expect(selectBatch(rows, {}).map(r => r.id)).toEqual(['a', 'z'])
  })
})

describe('פילוח מספרי', () => {
  it('סופר נשלחו/טרם + סטטוסים', () => {
    const s = batchStats([
      L({ id: '1', status: 'approved' }),
      L({ id: '2', status: 'approved', sent_to_donor_at: '2026-08-11T00:00:00Z' }),
      L({ id: '3', status: 'received' }),
      L({ id: '4', status: 'rejected' }),
    ])
    expect(s).toEqual({ total: 4, sent: 1, unsent: 3, approved: 2, received: 1, rejected: 1 })
  })

  it('רשימה ריקה', () => {
    expect(batchStats([])).toEqual({ total: 0, sent: 0, unsent: 0, approved: 0, received: 0, rejected: 0 })
  })
})

describe('כותרת הטווח', () => {
  it('מוצגת בעברית dd/mm/yyyy', () => {
    expect(rangeLabel('2026-08-01', '2026-08-31')).toBe('01/08/2026 — 31/08/2026')
    expect(rangeLabel('2026-08-01', null)).toBe('מ-01/08/2026 ואילך')
    expect(rangeLabel(null, '2026-08-31')).toBe('עד 31/08/2026')
  })

  it('⚠️ בלי טווח נאמר במפורש ולא נשאר ריק', () => {
    // הקורא במסמך חייב לדעת אם ראה הכול או חלק.
    expect(rangeLabel(null, null)).toBe('כל התקופה')
  })
})
