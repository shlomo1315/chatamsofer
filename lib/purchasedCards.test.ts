import { describe, it, expect } from 'vitest'
import { sumPurchasedCards, type PurchaseLedgerRow } from './purchasedCards'

// ─────────────────────────────────────────────────────────────────────────────
// "סך הכרטיסים שנקנו" הציג מקף, ו"נמסרו" איתו — אף שהוזנו 300 כרטיסים.
//
// השורש: החישוב רץ על היומן המקוצר (limit 50) במקום על היומן המלא
// (limit 5000). הכניסה המקורית של 300 היא תנועה ישנה שנדחקה מחוץ ל-50
// האחרונות, ולכן לא נספרה — purchasedCards יצא 0, והמסך מציג '—' על 0.
//
// ⚠️ החישוב חולץ לכאן דווקא משום שהתקלה חזרה: כל עוד הוא ישב בתוך
// ה-route הוא לא היה מכוסה בטסט, ו"תוקן" פעמיים בלי רשת ביטחון.
// ─────────────────────────────────────────────────────────────────────────────

const row = (delta: number, reason: string | null, aid_id: string | null = null): PurchaseLedgerRow =>
  ({ delta, reason, aid_id })

describe('sumPurchasedCards', () => {
  it('סופר restock', () => {
    expect(sumPurchasedCards([row(300, 'restock')])).toBe(300)
  })

  it('סופר adjust חיובי ללא שיוך ללידה — הכנסת מלאי ותיקה ללא reason', () => {
    // תנועות שנשמרו לפני שהיה reason מפורש מנורמלות ל-adjust.
    expect(sumPurchasedCards([row(300, null)])).toBe(300)
    expect(sumPurchasedCards([row(300, 'adjust')])).toBe(300)
  })

  it('אינו סופר adjust חיובי *עם* שיוך ללידה — זו החזרת כרטיס שנכשל', () => {
    expect(sumPurchasedCards([row(1, 'adjust', 'aid-1')])).toBe(0)
  })

  it('אינו סופר תנועות שליליות (ניכוי/מסירה)', () => {
    expect(sumPurchasedCards([row(-1, 'issue', 'aid-1'), row(-5, 'manual_out')])).toBe(0)
  })

  it('🔴 הרגרסיה: רכישה ותיקה מעבר ל-50 התנועות האחרונות עדיין נספרת', () => {
    // 300 בהתחלה, ואחריהן 60 ניכויים — הרכישה נדחקת מחוץ ל-50 האחרונות.
    // כשהחישוב רץ על היומן המקוצר התוצאה הייתה 0 והמסך הציג '—'.
    const ledger: PurchaseLedgerRow[] = [
      row(300, 'restock'),
      ...Array.from({ length: 60 }, (_, i) => row(-1, 'issue', `aid-${i}`)),
    ]
    expect(sumPurchasedCards(ledger)).toBe(300)
    expect(sumPurchasedCards(ledger.slice(-50))).toBe(0) // מה שקרה בפועל
  })

  it('מצטבר על פני כמה רכישות', () => {
    expect(sumPurchasedCards([row(300, 'restock'), row(200, 'restock'), row(48, null)])).toBe(548)
  })

  it('עמיד לערכים לא-מספריים', () => {
    expect(sumPurchasedCards([{ delta: NaN, reason: 'restock' }, { delta: 100, reason: 'restock' }])).toBe(100)
  })
})
