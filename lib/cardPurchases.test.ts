import { describe, it, expect } from 'vitest'
import { sumPurchases, validatePurchase } from './cardPurchases'

// ─────────────────────────────────────────────────────────────────────────────
// "סך הכרטיסים שנקנו" נכשל שלוש פעמים כשנגזר מיומן התנועות: 0 (הרכישה
// נדחקה מחוץ ל-50 השורות שנסרקו), 295 (נוסחה שגויה), 662 (סכימת כל
// התנועות החיוביות — כולל החזרות ותיקוני ספירה שאינם רכישות).
//
// המסקנה המבנית: יומן התנועות אינו יומן רכישות, ואין בו סימן ודאי
// שמבחין ביניהם. רכישה היא אירוע שנרשם, לא דבר שמנחשים בדיעבד.
// ─────────────────────────────────────────────────────────────────────────────

describe('sumPurchases', () => {
  it('הרכישה ההיסטורית לבדה — 300', () => {
    expect(sumPurchases([{ quantity: 300 }])).toBe(300)
  })

  it('מצטבר על פני רכישות', () => {
    expect(sumPurchases([{ quantity: 300 }, { quantity: 200 }])).toBe(500)
  })

  it('טבלה ריקה = 0', () => {
    expect(sumPurchases([])).toBe(0)
  })

  it('עמיד לערכים פגומים', () => {
    expect(sumPurchases([{ quantity: null }, { quantity: 300 }, { quantity: -5 }])).toBe(300)
  })

  it('🔴 אינו מושפע מכמות התנועות ביומן — זו כל מהות ההפרדה', () => {
    // קודם, 60 ניכויים והחזרות שינו את התוצאה. עכשיו הרכישות עומדות בפני עצמן.
    expect(sumPurchases([{ quantity: 300 }])).toBe(300)
  })
})

describe('validatePurchase', () => {
  const today = '2026-08-16'

  it('מקבל רכישה תקינה', () => {
    expect(validatePurchase(300, '2026-07-22', today)).toBeNull()
  })

  it('דורש תאריך — לא נופל לברירת מחדל של היום', () => {
    expect(validatePurchase(300, '', today)).toMatch(/תאריך/)
    expect(validatePurchase(300, undefined, today)).toMatch(/תאריך/)
  })

  it('דוחה תאריך בפורמט שגוי', () => {
    expect(validatePurchase(300, '22/07/2026', today)).toMatch(/תאריך/)
  })

  it('דוחה תאריך עתידי — תמיד שגיאת הקלדה', () => {
    expect(validatePurchase(300, '2026-09-01', today)).toMatch(/עתידי/)
  })

  it('מקבל את היום עצמו', () => {
    expect(validatePurchase(50, today, today)).toBeNull()
  })

  it('דוחה כמות לא חוקית', () => {
    expect(validatePurchase(0, '2026-07-22', today)).toMatch(/כמות/)
    expect(validatePurchase(-5, '2026-07-22', today)).toMatch(/כמות/)
    expect(validatePurchase(1.5, '2026-07-22', today)).toMatch(/כמות/)
    expect(validatePurchase('הרבה', '2026-07-22', today)).toMatch(/כמות/)
  })
})
