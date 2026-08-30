import { describe, it, expect } from 'vitest'
import { resolveTestMode, testModeOutcome, recipientForTestMail } from './holidayTestMode'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מצב בדיקה — המסלול המלא בלי כסף אמיתי.
//
// בלי זה הבדיקה היחידה של הטעינה והשובר היא להטעין כסף אמיתי לכרטיס של
// משפחה אמיתית ולשלוח לה מייל. הטסטים כאן נועלים את הגבול: מה בדיוק לא
// קורה במצב בדיקה, ומה כן.
//
// ⚠️ כל טעות כאן היא כסף שיצא או מייל שהגיע למשפחה בטעות. לכן ברירת
// המחדל בכל שאלה היא ההתנהגות הבטוחה.
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveTestMode — מתי המצב פעיל', () => {
  it('דלוק כשהחלוקה מסומנת', () => {
    expect(resolveTestMode({ test_mode: true, test_email: 'a@b.com' }).active).toBe(true)
  })

  it('כבוי כברירת מחדל', () => {
    expect(resolveTestMode({ test_mode: false, test_email: null }).active).toBe(false)
    expect(resolveTestMode(null).active).toBe(false)
  })

  it('🔴 חלוקה חסרה → כבוי, לא דלוק. ספק אינו סיבה לדלג על טעינה אמיתית', () => {
    expect(resolveTestMode(undefined).active).toBe(false)
  })
})

describe('testModeOutcome — 🔴 מה מוחזר במקום טעינה אמיתית', () => {
  const t = { recipientId: 'r1', idNumber: '123456782', name: 'משפחת כהן' }

  it('מדווח הצלחה — כדי שהמסלול ימשיך לשובר ולמייל', () => {
    const out = testModeOutcome(t)
    expect(out.ok).toBe(true)
    expect(out.recipientId).toBe('r1')
  })

  it('🔴 אין tlushId — לא נוצר שובר תשלום אמיתי בנדרים', () => {
    expect(testModeOutcome(t).tlushId).toBeNull()
  })

  it('⚠️ מסומן כבדיקה, כדי שהמסך לא יציג "נטען" על טעינה שלא קרתה', () => {
    expect(testModeOutcome(t).testMode).toBe(true)
  })
})

describe('recipientForTestMail — 🔴 לאן הולך המייל', () => {
  it('במצב רגיל — לכתובת המשפחה', () => {
    const mode = { active: false, email: null }
    expect(recipientForTestMail(mode, 'family@example.com')).toBe('family@example.com')
  })

  it('🔴 במצב בדיקה — לכתובת הבדיקה ולעולם לא למשפחה', () => {
    const mode = { active: true, email: 'test@office.com' }
    expect(recipientForTestMail(mode, 'family@example.com')).toBe('test@office.com')
  })

  it('🔴 מצב בדיקה בלי כתובת → null. לא נשלח כלום, ובוודאי לא למשפחה', () => {
    const mode = { active: true, email: null }
    expect(recipientForTestMail(mode, 'family@example.com')).toBeNull()
    expect(recipientForTestMail({ active: true, email: '  ' }, 'family@example.com')).toBeNull()
  })

  it('מצב רגיל בלי כתובת משפחה → null', () => {
    expect(recipientForTestMail({ active: false, email: null }, '')).toBeNull()
  })
})
