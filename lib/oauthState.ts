import { randomBytes, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// הגנת CSRF לחיבורי Google OAuth (ביקורת אבטחה 07.10).
//
// 🔴 הבעיה: ה-state נשא רק "mail"/"backup" או JSON של המחלקה — ערך קבוע
// שאינו קשור לדפדפן של המנהל. תוקף שאישר את ה-OAuth של המערכת עם חשבון
// Google *שלו* יכול היה לשלוח למנהל מחובר קישור callback עם הקוד שלו —
// והמערכת הייתה שומרת את האסימון של התוקף:
//   · state=backup ⇒ הגיבוי הלילי של כל המסד נשלח ל-Drive של התוקף.
//   · gmail-send ⇒ כל קודי האימות של הפורטל יוצאים מהתיבה שלו (Sent).
//
// הפתרון הסטנדרטי: nonce אקראי שנשמר בעוגייה httpOnly בתחילת החיבור,
// ונבדק מול ה-state בחזרה. התוקף אינו יכול לקבוע את העוגייה בדפדפן המנהל.
//
// ⚠️ SameSite=Lax: החזרה מ-Google היא ניווט GET ברמה העליונה, ובו Lax נשלחת.
// ─────────────────────────────────────────────────────────────────────────────

const COOKIE = (flow: string) => `g_oauth_${flow}`
const MAX_AGE = 10 * 60 // הקוד של Google עצמו פג בתוך דקות

/** nonce חדש להטמעה ב-state. */
export function newOAuthNonce(): string {
  return randomBytes(24).toString('hex')
}

/** שמירת ה-nonce בעוגייה על תגובת ההפניה ל-Google. */
export function setOAuthNonce(res: NextResponse, flow: string, nonce: string): void {
  res.cookies.set(COOKIE(flow), nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: MAX_AGE,
  })
}

/** האם ה-nonce שחזר ב-state תואם לעוגייה של הדפדפן הזה. */
export function oauthNonceMatches(request: NextRequest, flow: string, nonce: string | null | undefined): boolean {
  const want = request.cookies.get(COOKIE(flow))?.value ?? ''
  const got = String(nonce ?? '')
  if (!want || !got) return false
  const a = Buffer.from(got)
  const b = Buffer.from(want)
  if (a.length !== b.length) return false
  try { return timingSafeEqual(a, b) } catch { return false }
}
