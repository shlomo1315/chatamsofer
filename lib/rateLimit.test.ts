import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { rateLimit, clientIp, clientIpOrNull, __resetRateLimits } from './rateLimit'

// ⚠️ הבאג שהבדיקות האלה שומרות עליו:
// טופס הרישום הציבורי הוגבל ל-10 רישומים לשעה *לכל IP*. הקהל שלנו גולש דרך
// סינון (NetFree/רימון) ודרך רשתות משותפות, ולכן אלפי משפחות שונות מגיעות
// אלינו מאותה כתובת בדיוק — והמשפחה ה-11 קיבלה "יותר מדי ניסיונות רישום"
// ונחסמה לשעה שלמה, אחרי שכבר מילאה טופס ארוך ואימתה מייל וטלפון.

describe('מסלולי הרישום — ללא הגבלת קצב כלל', () => {
  // הבדיקה קוראת את הקוד עצמו: זו הדרך היחידה לתפוס החזרה של תקרת IP למסלול
  // הרישום בלי להריץ את כל שרשרת ה-Supabase של ה-route.
  const routes = [
    'app/api/portal/public-register/route.ts',
    'app/api/register/route.ts',
  ]

  for (const route of routes) {
    it(`${route} אינו קורא ל-rateLimit`, () => {
      const src = readFileSync(new URL(`../${route}`, import.meta.url), 'utf8')
      // מתעלמים משורות הערה — התיעוד שם מזכיר את המילה rateLimit בכוונה.
      const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
      expect(code).not.toMatch(/rateLimit\s*\(/)
    })
  }
})

describe('rateLimit — ספירה בחלון (שאר המסלולים)', () => {
  beforeEach(() => __resetRateLimits())

  it('מתיר בדיוק עד המכסה וחוסם מעבר לה', () => {
    for (let i = 0; i < 5; i++) expect(rateLimit('k', 5, 60_000)).toBe(true)
    expect(rateLimit('k', 5, 60_000)).toBe(false)
  })

  it('מפתחות שונים אינם צורכים זה מהמכסה של זה', () => {
    for (let i = 0; i < 5; i++) rateLimit('a', 5, 60_000)
    expect(rateLimit('a', 5, 60_000)).toBe(false)
    expect(rateLimit('b', 5, 60_000)).toBe(true)
  })

  it('חלון שהסתיים פותח ספירה חדשה', async () => {
    expect(rateLimit('w', 1, 50)).toBe(true)
    expect(rateLimit('w', 1, 50)).toBe(false)
    await new Promise(r => setTimeout(r, 70))
    expect(rateLimit('w', 1, 50)).toBe(true)
  })
})

describe('clientIpOrNull — IP חסר', () => {
  const req = (headers: Record<string, string>) => new Request('https://x.test', { headers })

  it('שולף את הכתובת הראשונה מ-x-forwarded-for', () => {
    expect(clientIpOrNull(req({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9')
  })

  it('נופל ל-x-real-ip', () => {
    expect(clientIpOrNull(req({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8')
  })

  it('מחזיר null כשאין כותרת — ולא ערך משותף לכולם', () => {
    // ⚠️ קריטי: 'unknown' מאחד את *כל* הבקשות במערכת לדלי אחד, ואז משתמש
    // אקראי נחסם בגלל עשרה משתמשים אחרים שאין לו איתם דבר. מסלול שחסימה שגויה
    // בו היא הנזק הגדול יבחר לדלג על מגבלת ה-IP במקום לחסום את כולם יחד.
    expect(clientIpOrNull(req({}))).toBeNull()
    expect(clientIpOrNull(req({ 'x-forwarded-for': '   ' }))).toBeNull()
  })

  it('clientIp נשאר תואם-לאחור עבור שאר המסלולים', () => {
    expect(clientIp(req({}))).toBe('unknown')
    expect(clientIp(req({ 'x-forwarded-for': '7.7.7.7' }))).toBe('7.7.7.7')
  })
})
