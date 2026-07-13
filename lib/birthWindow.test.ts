import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { validateRequest, parseDraft } from './emailRequestForms'
import { validateIsraeliId } from './validation'

const ctx = {
  recoveryHomes: ['אם וילד', 'טלזסטון'],
  centers: [
    { id: 'c1', name: 'מוקד בית שמש', city: 'בית שמש' },
    { id: 'c2', name: 'מוקד בני ברק', city: 'בני ברק' },
  ],
  pending: false,
}

/** בונה גוף טופס לידה — בדיוק כפי שהוא מגיע ממייל אמיתי (בלי רווח אחרי הנקודתיים). */
function birthBody(o: { date: string; babyId: string; gender?: string; home?: string; center?: string }) {
  return [
    `תאריך לידה (בפורמט DD/MM/YYYY, למשל 22/06/2026):${o.date}`,
    `מין הנולד/ת (השאירו רק אחד, מחקו את השני):${o.gender ?? 'בן'}`,
    `שם הנולד/ת (אם אין עדיין שם — השאירו ריק):יעקב`,
    `תעודת זהות של הנולד/ת (9 ספרות כולל ספרת ביקורת):${o.babyId}`,
    `בית החלמה (השאירו רק אחד, מחקו את השאר):${o.home ?? 'אם וילד'}`,
    `מספר מוקד לקבלת הכרטיס (כתבו את המספר של המוקד מהרשימה למטה):${o.center ?? '1'}`,
    `הערות:`,
  ].join('\n')
}

function validate(body: string) {
  return validateRequest('birth', parseDraft('birth', body, ctx), ctx)
}

// זמן קפוא: 13/07/2026. בלי זה הבדיקות יישברו מעצמן עם חלוף הזמן.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-13T09:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('חלון 6 השבועות', () => {
  it('לידה מלפני 6 חודשים — נדחית, עם התאריכים בהודעה', () => {
    const r = validate(birthBody({ date: '01/01/2026', babyId: '123456782' }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const msg = r.errors.join(' ')
      expect(msg).toContain('6 שבועות')
      expect(msg).toContain('01/01/2026')   // תאריך הלידה
      expect(msg).toContain('12/02/2026')   // המועד האחרון להגשה (+42 יום)
    }
  })

  it('לידה מלפני שבוע — מתקבלת', () => {
    const r = validate(birthBody({ date: '06/07/2026', babyId: '123456782' }))
    if (!r.ok) console.error('שגיאות:', r.errors)
    expect(r.ok).toBe(true)
  })

  it('בדיוק ביום ה-42 — עדיין בתוך החלון', () => {
    // 42 יום לפני 13/07/2026 = 01/06/2026
    const r = validate(birthBody({ date: '01/06/2026', babyId: '123456782' }))
    if (!r.ok) console.error('שגיאות:', r.errors)
    expect(r.ok).toBe(true)
  })

  it('יום 43 — מחוץ לחלון', () => {
    const r = validate(birthBody({ date: '31/05/2026', babyId: '123456782' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('6 שבועות')
  })

  it('תאריך לידה עתידי — נדחה (שגיאת הקלדה בשנה)', () => {
    const r = validate(birthBody({ date: '01/01/2027', babyId: '123456782' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('בעתיד')
  })
})

describe('תעודת זהות של הנולד/ת', () => {
  it('ספרת ביקורת שגויה — נדחית', () => {
    expect(validateIsraeliId('123456789')).toBe(false)
    const r = validate(birthBody({ date: '06/07/2026', babyId: '123456789' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('אינה תקינה')
  })

  it('ת"ז תקינה — מתקבלת', () => {
    expect(validateIsraeliId('123456782')).toBe(true)
  })

  it('רצף אפסים מוביל — נדחית', () => {
    // 000007070 עוברת את ספרת הביקורת (סכום Luhn = 10) אך אינה ת"ז אמיתית.
    // זו בדיוק הת"ז שהוגשה בפועל ונקלטה בטעות.
    expect(validateIsraeliId('000007070')).toBe(true)   // האלגוריתם לבדו מאשר
    const r = validate(birthBody({ date: '06/07/2026', babyId: '000007070' }))
    expect(r.ok).toBe(false)                            // הוולידציה שלנו דוחה
    if (!r.ok) expect(r.errors.join(' ')).toContain('תעודת הזהות')
  })

  it('אותה ספרה חוזרת — נדחית', () => {
    const r = validate(birthBody({ date: '06/07/2026', babyId: '111111111' }))
    expect(r.ok).toBe(false)
  })
})

describe('כל השגיאות מוחזרות יחד — לא אחת בכל פעם', () => {
  it('לידה ישנה + ת"ז פסולה + בית החלמה לא קיים', () => {
    const r = validate(birthBody({
      date: '01/01/2026',        // מחוץ לחלון
      babyId: '123456789',       // ספרת ביקורת שגויה
      home: 'בית שלא קיים',      // לא ברשימה
    }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const msg = r.errors.join(' | ')
      console.log('\nההודעה שהמשתמש מקבל:\n  ' + r.errors.join('\n  ') + '\n')
      expect(msg).toContain('6 שבועות')
      expect(msg).toContain('תקינה')
      expect(msg).toContain('בית החלמה')
      expect(r.errors.length).toBeGreaterThanOrEqual(3)
    }
  })
})
