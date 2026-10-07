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
// החנות לכל מי שמנחש את שם השדה.
//
// 🔴 עם תפוגה (ביקורת אבטחה 07.10): קודם האסימון היה קבוע לנצח והדף פתוח
// לכל העולם — כל מבקר בנתיב הנסתר קיבל אסימון שמאפשר להזמין גם כשהיריד
// סגור לעונה, ולתמיד. עכשיו הדף לצוות בלבד, והאסימון פג אחרי 12 שעות.
// ─────────────────────────────────────────────────────────────────────────────

const PAYLOAD = 'yerid-preview-checkout'
const TTL_MS = 12 * 60 * 60 * 1000

/** האסימון לשליחה ללקוח בנתיב התצוגה המקדימה. null = אין סוד חתימה בסביבה. */
export function bookFairPreviewToken(now = Date.now()): string | null {
  const exp = now + TTL_MS
  const sig = signPayload(`${PAYLOAD}:${exp}`)
  return sig ? `${exp}.${sig}` : null
}

/** האם האסימון שהתקבל מהלקוח תקף ולא פג. */
export function isValidPreviewToken(token: unknown, now = Date.now()): boolean {
  const t = String(token ?? '').trim()
  const dot = t.indexOf('.')
  if (dot <= 0) return false
  const exp = Number(t.slice(0, dot))
  if (!Number.isFinite(exp) || exp < now || exp > now + TTL_MS + 60_000) return false
  return verifySignature(`${PAYLOAD}:${exp}`, t.slice(dot + 1))
}
