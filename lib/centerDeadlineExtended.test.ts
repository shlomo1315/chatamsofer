import { describe, it, expect } from 'vitest'
import {
  isExtendedRecipient, effectiveDeadline, recipientDeadlineState,
} from './centerDeadline'

const BASE = '2026-09-02T19:00:00+03:00'   // המועד הכללי
const LATER = '2026-09-03T00:00:00+03:00'  // חצות — ההארכה
const EARLIER = '2026-09-02T12:00:00+03:00'

describe('isExtendedRecipient — מי בקבוצה', () => {
  it('הוספה ידנית נכללת אוטומטית', () => {
    expect(isExtendedRecipient({ source: 'admin' })).toBe(true)
  })

  it('סימון ידני מכניס גם ערוץ אחר', () => {
    expect(isExtendedRecipient({ source: 'portal', deadline_extended: true })).toBe(true)
    expect(isExtendedRecipient({ source: 'phone', deadline_extended: true })).toBe(true)
  })

  it('שאר הערוצים אינם נכללים', () => {
    expect(isExtendedRecipient({ source: 'portal' })).toBe(false)
    expect(isExtendedRecipient({ source: 'nedarim', deadline_extended: false })).toBe(false)
  })

  it('שורה חסרה אינה נכללת', () => {
    expect(isExtendedRecipient(null)).toBe(false)
    expect(isExtendedRecipient({})).toBe(false)
  })
})

describe('effectiveDeadline — מאריך בלבד', () => {
  it('מי שבקבוצה מקבל את המועד המאוחר', () => {
    expect(effectiveDeadline(BASE, LATER, { source: 'admin' })).toBe(LATER)
  })

  it('מי שאינו בקבוצה מקבל את המועד הכללי', () => {
    expect(effectiveDeadline(BASE, LATER, { source: 'portal' })).toBe(BASE)
  })

  // 🔴 ההגנה המרכזית: תאריך מוארך שהוקלד מוקדם מדי היה **נועל את הקבוצה
  // לפני כולם** — ההפך הגמור מכוונת ההגדרה.
  it('מועד מוארך מוקדם מהכללי אינו מקצר', () => {
    expect(effectiveDeadline(BASE, EARLIER, { source: 'admin' })).toBe(BASE)
  })

  it('בלי מועד מוארך — נופל לכללי', () => {
    expect(effectiveDeadline(BASE, null, { source: 'admin' })).toBe(BASE)
    expect(effectiveDeadline(BASE, '', { source: 'admin' })).toBe(BASE)
  })

  it('בלי מועד כללי — המוארך חל על הקבוצה בלבד', () => {
    expect(effectiveDeadline(null, LATER, { source: 'admin' })).toBe(LATER)
    expect(effectiveDeadline(null, LATER, { source: 'portal' })).toBe(null)
  })

  // ⚠️ עקבי עם deadlineState שאינו סוגר על תאריך פגום.
  it('תאריך פגום אינו מבטל את השני', () => {
    expect(effectiveDeadline(BASE, 'לא-תאריך', { source: 'admin' })).toBe(BASE)
    expect(effectiveDeadline('שגיאה', LATER, { source: 'admin' })).toBe(LATER)
  })
})

describe('recipientDeadlineState — מה שהמסך והטלפון מציגים', () => {
  const during = new Date('2026-09-02T21:00:00+03:00') // אחרי 19:00, לפני חצות

  it('בקבוצה: עדיין פתוח, עם סימון שההארכה חלה', () => {
    const s = recipientDeadlineState(BASE, LATER, { source: 'admin' }, during)
    expect(s.closed).toBe(false)
    expect(s.extended).toBe(true)
    expect(s.msLeft).toBeGreaterThan(0)
  })

  it('מחוץ לקבוצה: סגור באותו רגע בדיוק', () => {
    const s = recipientDeadlineState(BASE, LATER, { source: 'portal' }, during)
    expect(s.closed).toBe(true)
    expect(s.extended).toBe(false)
  })

  it('אחרי ההארכה — סגור גם לקבוצה', () => {
    const after = new Date('2026-09-03T01:00:00+03:00')
    expect(recipientDeadlineState(BASE, LATER, { source: 'admin' }, after).closed).toBe(true)
  })

  // ⚠️ extended=false כשההארכה אינה משנה בפועל — אחרת המסך היה מכריז
  // "מועד מוארך" על מי שמקבל בדיוק את אותה שעה כמו כולם.
  it('הארכה שאינה משנה אינה מסומנת כהארכה', () => {
    const s = recipientDeadlineState(BASE, EARLIER, { source: 'admin' }, during)
    expect(s.extended).toBe(false)
  })
})
