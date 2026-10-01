import { signPayload, verifySignature } from '@/lib/signedToken'

// ─────────────────────────────────────────────────────────────────────────────
// אסימון התצוגה המקדימה של יריד הספרים (/yerid101315).
//
// 🔴 הנתיב הנסתר הציג את החנות, אבל כל ניסיון הזמנה נחסם: /api/yerid/checkout
// בודק book_fair_open ב-app_settings, והוא false עד הפתיחה הרשמית. כלומר
// אפשר היה לראות את הקטלוג אך לא לבדוק את מסלול הרכישה — בדיוק מה שצריך
// לבדוק לפני שנפתחים לקהל.
//
// ⚠️ אסימון חתום ולא דגל בגוף הבקשה: "preview: true" מהלקוח היה פותח את
// החנות לכל מי שמנחש את שם השדה. החתימה נגזרת מסוד השרת, ולכן רק מי שקיבל
// את הקישור הנסתר יכול להזמין לפני הפתיחה.
//
// ⚠️ ללא תפוגה במכוון: זהו קישור עבודה פנימי לצוות, לא הרשאה זמנית. הוא
// מפסיק להיות רלוונטי ברגע שהיריד נפתח לכולם.
// ─────────────────────────────────────────────────────────────────────────────

const PAYLOAD = 'yerid-preview-checkout'

/** האסימון לשליחה ללקוח בנתיב התצוגה המקדימה. null = אין סוד חתימה בסביבה. */
export function bookFairPreviewToken(): string | null {
  return signPayload(PAYLOAD)
}

/** האם האסימון שהתקבל מהלקוח תקף. */
export function isValidPreviewToken(token: unknown): boolean {
  const t = String(token ?? '').trim()
  if (!t) return false
  return verifySignature(PAYLOAD, t)
}
