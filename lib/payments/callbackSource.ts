import { isNedarimWebhookIp } from './nedarimProvider'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מאיפה באמת הגיע דיווח התשלום (ביקורת אבטחה 05.10).
//
// הבאג: הבדיקה הקודמת קיבלה את הדיווח אם *אחת* הכתובות בשרשרת
// x-forwarded-for היא של נדרים. אבל הערכים הראשונים בשרשרת הם מה שהשולח
// כתב בעצמו — `X-Forwarded-For: 18.196.146.117` עבר את הבדיקה, ובלי מפתח
// חתימה (לא הוגדר) כל אחד יכול היה לסמן הזמנה שלו כשולמה ולקבל ספרים.
//
// מה ידוע מהלוגים (04.10): Railway רושם את כתובת המקור האמיתית
// (18.196.146.117 לנדרים, 213.57.x לבדיקת curl), והאפליקציה ראתה בסוף
// השרשרת כתובת של שכבת ביניים (79.127.178.x). כלומר: התשתית מוסיפה את
// המקור האמיתי ואחריו קפיצה אחת. ערך מזויף נמצא תמיד *לפני* שניהם.
//
// ⇒ רק שתי הכתובות האחרונות בשרשרת נאמנות.
//
// ⚠️ 'spoofed' אינו נדחה בראוט אלא מועבר לבדיקת אנוש (payment_mismatch):
// אם ההנחה על מבנה השרשרת שגויה, תשלום אמיתי לא ייאבד — הוא ימתין
// לאישור במקום להידחות כמו ב-04.10.
// ─────────────────────────────────────────────────────────────────────────────

export type CallbackSource = 'trusted' | 'spoofed' | 'unknown'

/** כמה כתובות מסוף השרשרת נוספו ע"י התשתית שלנו (מקור + קפיצה אחת). */
export const TRUSTED_TAIL = 2

export function classifyCallbackSource(xForwardedFor: string | null, xRealIp: string | null): CallbackSource {
  const chain = String(xForwardedFor ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const real = String(xRealIp ?? '').trim()

  // ⚠️ בלי x-forwarded-for בכלל — אין שכבת proxy, ו-x-real-ip הוא המקור.
  if (!chain.length) return isNedarimWebhookIp(real) ? 'trusted' : 'unknown'

  const tail = chain.slice(-TRUSTED_TAIL)
  if (tail.some(isNedarimWebhookIp)) return 'trusted'
  if (chain.some(isNedarimWebhookIp) || isNedarimWebhookIp(real)) return 'spoofed'
  return 'unknown'
}
