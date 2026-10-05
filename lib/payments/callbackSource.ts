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

export function classifyCallbackSource(xForwardedFor: string | null, xRealIp: string | null): CallbackSource {
  const chain = String(xForwardedFor ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const real = String(xRealIp ?? '').trim()

  if (real) {
    if (isNedarimWebhookIp(real)) return 'trusted'
    return chain.some(isNedarimWebhookIp) ? 'spoofed' : 'unknown'
  }

  // ⚠️ בלי x-real-ip (שינוי תשתית) — הכתובת האחרונה בשרשרת היא זו
  // שהתשתית הוסיפה. כל ערך לפניה עשוי להיות של השולח.
  if (chain.length && isNedarimWebhookIp(chain[chain.length - 1])) return 'trusted'
  return chain.some(isNedarimWebhookIp) ? 'spoofed' : 'unknown'
}
