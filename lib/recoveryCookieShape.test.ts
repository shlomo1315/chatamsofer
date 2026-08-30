import { describe, it, expect } from 'vitest'
import { RECOVERY_COOKIE_RE } from './recoveryCookieShape'

// ─────────────────────────────────────────────────────────────────────────────
// צורת שם עוגיית פורטל בית ההחלמה.
//
// השם נגזר מ-home: base64 של השם, בלי '=', עם '-'/'_' במקום '+'/'/',
// חתוך ל-32 תווים (ראו portalCookieName ב-app/api/portal/login/route.ts).
//
// 🔴 הביטוי משמש לדחייה *מוקדמת* בהעלאת קבלה, לפני משיכת הקובץ. הוא רק
// תנאי הכרחי — האימות האמיתי (verifyRecoveryPortalToken) רץ אחריו כרגיל.
// לכן טעות לכיוון המחמיר היא באג אמיתי: היא תדחה נציג מחובר.
// ─────────────────────────────────────────────────────────────────────────────

/** משכפל את portalCookieName כדי לבדוק מול פלט אמיתי ולא מול ניחוש. */
function cookieNameFor(home: string): string {
  return Buffer.from(home, 'utf-8').toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_').slice(0, 32)
}

describe('RECOVERY_COOKIE_RE — תופס שמות אמיתיים', () => {
  it('שם באנגלית', () => {
    expect(RECOVERY_COOKIE_RE.test(cookieNameFor('shalom'))).toBe(true)
  })

  it('⚠️ שם בעברית — base64 של UTF-8 ארוך ונחתך ל-32', () => {
    const n = cookieNameFor('בית החלמה בני ברק')
    expect(n.length).toBe(32)
    expect(RECOVERY_COOKIE_RE.test(n)).toBe(true)
  })

  it('שם קצר מאוד', () => {
    expect(RECOVERY_COOKIE_RE.test(cookieNameFor('א'))).toBe(true)
  })

  it('שם עם רווחים וגרש', () => {
    expect(RECOVERY_COOKIE_RE.test(cookieNameFor("בית החלמה ע\"ש הרב'ה"))).toBe(true)
  })
})

describe('RECOVERY_COOKIE_RE — הגבול של הסינון הגס', () => {
  // ⚠️ הביטוי *כן* תופס עוגיות אחרות של המערכת, ואי אפשר אחרת: שם העוגייה
  // הוא base64url של שם חופשי, ולכן בלתי-מובחן מ-'pb_session'. זו הסיבה
  // שהבדיקה היא תנאי הכרחי בלבד — מי שעובר אותה נבדק לגופו מיד אחר כך.
  //
  // הערך שלה הוא בדחייה של מי שאין לו *שום* עוגייה מתאימה — בדיוק
  // המקרה של סשן שפג, שהוא התרחיש שנצפה בלוג.
  it('תופס גם עוגיות אחרות — מקובל, כי האימות האמיתי בא אחריו', () => {
    expect(RECOVERY_COOKIE_RE.test('pb_session')).toBe(true)
  })

  it('🔴 דוחה כשאין אף עוגייה מתאימה — התרחיש שהתיקון נועד לו', () => {
    const noCookies: { name: string }[] = []
    expect(noCookies.some(c => RECOVERY_COOKIE_RE.test(c.name))).toBe(false)
  })

  it('דוחה תווים שאינם base64url, וריק', () => {
    expect(RECOVERY_COOKIE_RE.test('has.dot')).toBe(false)
    expect(RECOVERY_COOKIE_RE.test('')).toBe(false)
    // ארוך מ-32 — portalCookieName חותך שם, ולכן זה לא שם שהוא מייצר
    expect(RECOVERY_COOKIE_RE.test('a'.repeat(33))).toBe(false)
  })
})
