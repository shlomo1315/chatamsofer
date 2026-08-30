import { describe, it, expect } from 'vitest'
import { toNedarimExpiry } from './holidayCardLoad'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 תוקף הכרטיס בנדרים.
//
// עד כה ההטענה יצאה עם expiration ריק — הכרטיסים חולקו בלי תאריך תפוגה
// כלל, ולכן היתרה נשארה זמינה ללא הגבלת זמן.
//
// ⚠️ התאריך נשלח לנדרים בפורמט dd/MM/yyyy. פורמט ISO נשלח כפי שהוא היה
// מתקבל אצלם כתאריך אחר לגמרי (או נדחה) — וזה כסף אמיתי על כרטיסים
// אמיתיים, בלי שום דרך לראות שהתוקף שגוי.
// ─────────────────────────────────────────────────────────────────────────────

describe('toNedarimExpiry — המרה לפורמט של נדרים', () => {
  it('ממיר תאריך ISO ל-dd/MM/yyyy', () => {
    expect(toNedarimExpiry('2026-11-20')).toBe('20/11/2026')
  })

  it('משאיר אפסים מובילים', () => {
    expect(toNedarimExpiry('2026-01-05')).toBe('05/01/2026')
  })

  it('מקבל גם חותמת זמן מלאה', () => {
    expect(toNedarimExpiry('2026-11-20T00:00:00.000Z')).toBe('20/11/2026')
  })

  it('🔴 ריק/null → undefined (הטענה בלי תוקף, כמו קודם)', () => {
    expect(toNedarimExpiry(null)).toBeUndefined()
    expect(toNedarimExpiry(undefined)).toBeUndefined()
    expect(toNedarimExpiry('')).toBeUndefined()
    expect(toNedarimExpiry('   ')).toBeUndefined()
  })

  it('⚠️ תאריך פגום → undefined ולא מחרוזת שבורה', () => {
    // תאריך לא תקין שנשלח לנדרים עלול להתקבל כתאריך אחר לגמרי.
    expect(toNedarimExpiry('לא-תאריך')).toBeUndefined()
    expect(toNedarimExpiry('2026-13-45')).toBeUndefined()
  })
})
