import { describe, it, expect } from 'vitest'
import { GuardCore, GUARD_LIMITS, PAUSE_MS, opKeyOf } from './nedarimGuard'

// 🔴 בדיקות בלי רשת ובלי פנייה אחת לנדרים — הליבה טהורה, "עכשיו" מוזרק.

const T0 = 1_791_000_000_000
const MIN = 60_000

describe('🔴 שחזור התקלה של 05.10 — רענון יתרות שנכשל', () => {
  it('190 משפחות × 2 ניסיונות, כולם נכשלים ⇒ נעצר אחרי 15 ולא 380', () => {
    const g = new GuardCore()
    let sent = 0
    let blocked = 0
    let now = T0
    for (let i = 0; i < 380; i++) {
      now += 500 // כמו הלולאה המקורית: ~2 פניות בשנייה
      const block = g.check('cards', opKeyOf('7018265', 'GetClientCard', { ClientId: String(1000 + Math.floor(i / 2)) }), now)
      if (block) { blocked++; continue }
      sent++
      const streak = g.result('cards', false) // נדרים דוחים — חסימה / אין הרשאה
      if (streak) g.pause('cards', now)
    }
    expect(sent).toBe(GUARD_LIMITS.cards.failStreak)
    expect(blocked).toBe(380 - GUARD_LIMITS.cards.failStreak)
  })

  it('פריסה חדשה לא מאפסת: ההשהיה ממשיכה (נטענת מהמסד ל-pausedUntil)', () => {
    const g = new GuardCore()
    g.pausedUntil.cards = T0 + PAUSE_MS // כמו שנטען מ-app_settings אחרי עלייה
    expect(g.check('cards', null, T0 + MIN)?.kind).toBe('paused')
  })
})

describe('נפח', () => {
  it('שימוש רגיל עובר', () => {
    const g = new GuardCore()
    for (let i = 0; i < 50; i++) expect(g.check('cards', null, T0 + i * 1000)).toBeNull()
  })

  it('80 בדקה ⇒ הפנייה ה-81 עוצרת את הערוץ', () => {
    const g = new GuardCore()
    for (let i = 0; i < 80; i++) expect(g.check('cards', null, T0 + i * 100)).toBeNull()
    const b = g.check('cards', null, T0 + 80 * 100)
    expect(b?.kind).toBe('volume')
    expect(b?.trip).toBe(true)
  })

  it('1,200 בשעה גם כשאין פיק בדקה אחת', () => {
    const g = new GuardCore()
    for (let i = 0; i < 1200; i++) expect(g.check('cards', null, T0 + i * 2900)).toBeNull()
    expect(g.check('cards', null, T0 + 1200 * 2900)?.kind).toBe('volume')
  })
})

describe('🔴 לולאה — אותה פנייה שוב ושוב', () => {
  const key = opKeyOf('7014553', 'SaveClientCard', { Zeout: '012345678' })

  it('8 פעמים ב-10 דקות מותר, התשיעית נחסמת — בלי לעצור את כל הערוץ', () => {
    const g = new GuardCore()
    for (let i = 0; i < 8; i++) expect(g.check('cards', key, T0 + i * MIN)).toBeNull()
    const b = g.check('cards', key, T0 + 8 * MIN)
    expect(b?.kind).toBe('repeat')
    expect(b?.trip).toBe(false)
    // משפחה אחרת ממשיכה כרגיל
    expect(g.check('cards', opKeyOf('7014553', 'SaveClientCard', { Zeout: '099999999' }), T0 + 8 * MIN)).toBeNull()
  })

  it('אחרי שהחלון עובר — מותר שוב', () => {
    const g = new GuardCore()
    for (let i = 0; i < 8; i++) g.check('cards', key, T0 + i * 1000)
    expect(g.check('cards', key, T0 + 11 * MIN)).toBeNull()
  })

  it('פנייה בלי מזהה (טבלת הלקוחות) אינה נבדקת כחזרה', () => {
    expect(opKeyOf('7014553', 'GetClient_Table', {})).toBeNull()
  })
})

describe('כשלים רצופים', () => {
  it('הצלחה מאפסת את הרצף', () => {
    const g = new GuardCore()
    for (let i = 0; i < 14; i++) expect(g.result('cards', false)).toBeNull()
    expect(g.result('cards', true)).toBeNull()
    for (let i = 0; i < 14; i++) expect(g.result('cards', false)).toBeNull()
    expect(g.result('cards', false)).toMatch(/15 כשלים רצופים/)
  })
})

describe('השהיה', () => {
  it('נגמרת אחרי 15 דקות', () => {
    const g = new GuardCore()
    g.pause('cards', T0)
    expect(g.check('cards', null, T0 + PAUSE_MS - 1)?.kind).toBe('paused')
    expect(g.check('cards', null, T0 + PAUSE_MS)).toBeNull()
  })

  it('🔴 עצירת הכרטיסים לא עוצרת את קופת היריד', () => {
    const g = new GuardCore()
    g.pause('cards', T0)
    expect(g.check('cards', null, T0 + 1000)?.kind).toBe('paused')
    expect(g.check('payments', 'CreateTransaction:121999', T0 + 1000)).toBeNull()
  })
})
