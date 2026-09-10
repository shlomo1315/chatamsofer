import { describe, it, expect } from 'vitest'
import { networkErrorMessage, DEPLOY_HINT } from './networkErrorMessage'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 "שגיאת רשת" לא אמר למשתמש דבר.
//
// ⚠️ מה שקרה בפועל: המנהל ניסה לעדכן מלאי של 300 כרטיסים בדיוק בזמן שפריסה
// חדשה עלתה. השרת התחלף באמצע, הקריאה נפלה, והמסך אמר "שגיאת רשת" — כאילו
// האינטרנט שלו מנותק. הוא לא ידע אם הפעולה נכנסה או לא, והמלאי אכן לא עודכן.
//
// 🔴 ההודעה החדשה אומרת גם מה קרה וגם מה לעשות: לנסות שוב בעוד רגע. היא
// אינה מבטיחה שזו פריסה — הדפדפן אינו יכול לדעת — אלא מונה את שתי הסיבות
// האפשריות, כי שתיהן נפתרות באותה פעולה.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 networkErrorMessage', () => {
  it('כשל fetch — מזכיר עדכון גרסה ולא רק "רשת"', () => {
    const msg = networkErrorMessage(new TypeError('Failed to fetch'))
    expect(msg).toContain('עדכון גרסה')
    expect(msg).toContain('נסו שוב')
  })

  it('🔴 אינו מבטיח שהפעולה נכשלה בוודאות', () => {
    // ⚠️ הבקשה עשויה להגיע לשרת ולהיקטע בדרך חזרה. הודעה שקובעת
    // "לא בוצע" הייתה גורמת למנהל לבצע שוב — וכפילות בכסף/מלאי.
    const msg = networkErrorMessage(new TypeError('Failed to fetch'))
    expect(msg).toContain('בדקו')
  })

  it('שגיאה עם הודעה מהשרת — מוצגת כפי שהיא', () => {
    expect(networkErrorMessage(new Error('אין הרשאה'))).toBe('אין הרשאה')
  })

  it('טקסט חופשי מוחזר כפי שהוא', () => {
    expect(networkErrorMessage('הסכום אינו תקין')).toBe('הסכום אינו תקין')
  })

  it('שגיאה ריקה — נופלת להודעת ברירת המחדל', () => {
    expect(networkErrorMessage(null)).toContain('עדכון גרסה')
    expect(networkErrorMessage(undefined)).toContain('עדכון גרסה')
    expect(networkErrorMessage(new Error(''))).toContain('עדכון גרסה')
  })

  it('AbortError — פסק זמן, אותה משמעות מעשית', () => {
    const e = new Error('aborted'); e.name = 'AbortError'
    expect(networkErrorMessage(e)).toContain('נסו שוב')
  })

  it('NetworkError (פיירפוקס) מזוהה גם הוא', () => {
    expect(networkErrorMessage(new TypeError('NetworkError when attempting to fetch resource')))
      .toContain('עדכון גרסה')
  })

  it('DEPLOY_HINT אינו ריק ומנוסח בעברית', () => {
    expect(DEPLOY_HINT.trim().length).toBeGreaterThan(20)
    expect(DEPLOY_HINT).toMatch(/[א-ת]/)
  })
})
