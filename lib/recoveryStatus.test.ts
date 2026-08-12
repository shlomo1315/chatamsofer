import { describe, it, expect } from 'vitest'
import { recoveryState, groupByHome, totalsOf, RECOVERY_LABEL, type RecoverySource } from './recoveryStatus'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ הדוח הזה עונה על "כמה יולדות מימשו בית החלמה". טעות כאן אינה ויזואלית:
// היא מייצרת מספר שגוי שעליו נבנה תקציב, או מסתירה כסף שטרם נגבה.
// ─────────────────────────────────────────────────────────────────────────────

const row = (o: Partial<RecoverySource> = {}): RecoverySource => ({
  recovery_home: 'טלזסטון', recovery_arrived: null, receiptCount: 0, recovery_amount: 0, ...o,
})

describe('recoveryState — שני צירים נפרדים', () => {
  it('🔴 הגיעה + קבלה = מימשה וחויבה', () => {
    expect(recoveryState(row({ recovery_arrived: true, receiptCount: 1 }))).toBe('realized-charged')
  })

  it('🔴 הגיעה בלי קבלה = מימשה, טרם חויבה', () => {
    // זה הפער שהמשרד צריך לראות: כסף שטרם נגבה מבית ההחלמה.
    expect(recoveryState(row({ recovery_arrived: true, receiptCount: 0 }))).toBe('realized-unbilled')
  })

  it('לא הגיעה = טרם מימשה', () => {
    expect(recoveryState(row({ recovery_arrived: false }))).toBe('not-realized')
    expect(recoveryState(row({ recovery_arrived: null }))).toBe('not-realized')
  })

  it('🔴 בלי בית החלמה — אינה בספירה כלל', () => {
    // יולדת שלא ביקשה בית החלמה אינה "טרם מימשה" — היא מחוץ לדוח.
    expect(recoveryState(row({ recovery_home: null }))).toBe('none')
    expect(recoveryState(row({ recovery_home: '  ' }))).toBe('none')
  })

  it('🔴 קבלה בסכום 0 עדיין נחשבת חיוב', () => {
    // הקבלה היא האירוע, לא הסכום. סכום 0 הוא תקלה שצריך לראות בדוח —
    // לא סיבה לסווג את היולדת כ"טרם חויבה".
    expect(recoveryState(row({ recovery_arrived: true, receiptCount: 1, recovery_amount: 0 })))
      .toBe('realized-charged')
  })

  it('🔴 קבלה בלי הגעה אינה הופכת אותה למימוש', () => {
    // הגעה היא התנאי. קבלה בלי סימון הגעה היא נתון חסר, לא מימוש.
    expect(recoveryState(row({ recovery_arrived: false, receiptCount: 2 }))).toBe('not-realized')
  })

  it('לכל מצב יש תווית', () => {
    for (const k of ['realized-charged', 'realized-unbilled', 'not-realized', 'none'] as const) {
      expect(RECOVERY_LABEL[k]).toBeTruthy()
    }
  })
})

describe('groupByHome — הפילוח שהדוח נשען עליו', () => {
  const rows = [
    row({ recovery_home: 'טלזסטון', recovery_arrived: true, receiptCount: 1, recovery_amount: 500, recovery_nights: 2 }),
    row({ recovery_home: 'טלזסטון', recovery_arrived: true, receiptCount: 0 }),
    row({ recovery_home: 'טלזסטון', recovery_arrived: false }),
    row({ recovery_home: 'נווה שלום', recovery_arrived: true, receiptCount: 2, recovery_amount: 800, recovery_nights: 3 }),
    row({ recovery_home: null }),   // מחוץ לספירה
  ] as (RecoverySource & { recovery_nights?: number | null })[]

  it('סופר כל מצב בנפרד לכל בית', () => {
    const g = groupByHome(rows)
    const t = g.get('טלזסטון')!
    expect(t.realizedCharged).toBe(1)
    expect(t.realizedUnbilled).toBe(1)
    expect(t.notRealized).toBe(1)
    expect(t.realized).toBe(2)
  })

  it('🔴 מי שאין לו בית החלמה אינו נספר לאף בית', () => {
    const g = groupByHome(rows)
    expect(g.has('—')).toBe(false)
    expect([...g.keys()].sort()).toEqual(['טלזסטון', 'נווה שלום'])
  })

  it('מסכם סכומים ולילות לכל בית', () => {
    const g = groupByHome(rows)
    expect(g.get('נווה שלום')!.amount).toBe(800)
    expect(g.get('נווה שלום')!.nights).toBe(3)
  })

  it('רשימה ריקה אינה מפילה', () => {
    expect(groupByHome([]).size).toBe(0)
  })
})

describe('totalsOf — הסיכום הכולל', () => {
  it('סוכם על פני כל הבתים', () => {
    const t = totalsOf([
      row({ recovery_home: 'א', recovery_arrived: true, receiptCount: 1, recovery_amount: 100 }),
      row({ recovery_home: 'ב', recovery_arrived: true, receiptCount: 0 }),
      row({ recovery_home: 'ב', recovery_arrived: false }),
    ] as RecoverySource[])
    expect(t.realizedCharged).toBe(1)
    expect(t.realizedUnbilled).toBe(1)
    expect(t.notRealized).toBe(1)
    expect(t.realized).toBe(2)
    expect(t.amount).toBe(100)
  })

  it('🔴 realized הוא סכום שני מצבי המימוש', () => {
    // אם הוא היה סופר רק את המחויבים, הדוח היה מדווח פחות מימושים
    // ממה שקרה בפועל — ומספר תקציבי שגוי.
    const t = totalsOf([
      row({ recovery_home: 'א', recovery_arrived: true, receiptCount: 1 }),
      row({ recovery_home: 'א', recovery_arrived: true, receiptCount: 0 }),
    ] as RecoverySource[])
    expect(t.realized).toBe(t.realizedCharged + t.realizedUnbilled)
    expect(t.realized).toBe(2)
  })
})
