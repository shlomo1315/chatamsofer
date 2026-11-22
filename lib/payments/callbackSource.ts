import { isNedarimWebhookIp } from './nedarimProvider'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מאיפה באמת הגיע דיווח התשלום (ביקורת אבטחה 05.10).
//
// מה נמדד בפרודקשן (בדיקות curl חיות, 05.10 03:34):
//   x-forwarded-for = "<כתובת Cloudflare>, 79.127.178.82"   ← תשתית בלבד
//   x-real-ip       = הכתובת האמיתית של השולח
// · X-Forwarded-For מזויף שנשלח מבחוץ — *נזרק* בדרך ולא הגיע לשרת.
// · X-Real-IP / CF-Connecting-IP מזויפים — *נדרסו*; השרת ראה את הכתובת
//   האמיתית (הבקשה נדחתה ב-403 ולא סווגה כנדרים).
//
// ⇒ x-real-ip הוא המקור הנאמן. כתובת של נדרים שמופיעה רק *במקום אחר*
// בשרשרת (מצב שלא אמור לקרות) מסווגת 'spoofed' ועוברת לבדיקת אנוש —
// לא נדחית, כדי שתשלום אמיתי לא ייאבד אם התשתית תשתנה (כמו ב-04.10).
// ─────────────────────────────────────────────────────────────────────────────

export type CallbackSource = 'trusted' | 'spoofed' | 'unknown'

// 🔴 22.11.2026 (ביקורת אבטחה): מאז המעבר ל-AWS (19.11) הדומיין מפנה ישירות
// ל-ALB. ה-ALB *אינו* קובע x-real-ip ואינו מוחק אותו — הערך שהלקוח שולח מגיע
// כמות שהוא. תוקף יכול היה לשלוח X-Real-IP של נדרים ולסמן הזמנה כשולמה.
// ה-ALB מוסיף את כתובת הלקוח האמיתית *בסוף* X-Forwarded-For — רק היא נאמנה.
// x-real-ip *לעולם* אינו מעניק אמון. כתובת נדרים שמופיעה רק בו (או לפני
// האחרון בשרשרת) ⇒ spoofed: לא מסומן שולם ולא נכשל, עובר לבדיקת אנוש. כך גם
// אם ההנחה על התשתית שגויה, תשלום אמיתי לא נדחה ולא אובד — רק ממתין לאישור.
export function classifyCallbackSource(xForwardedFor: string | null, xRealIp: string | null): CallbackSource {
  const chain = String(xForwardedFor ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const real = String(xRealIp ?? '').trim()
  if (chain.length && isNedarimWebhookIp(chain[chain.length - 1])) return 'trusted'
  return chain.some(isNedarimWebhookIp) || (real && isNedarimWebhookIp(real)) ? 'spoofed' : 'unknown'
}
