// ─────────────────────────────────────────────────────────────────────────────
// רשימת התפוצה של יריד הספרים — איחוד נרשמי התזכורת והרוכשים בפועל.
//
// 🔴 למה איחוד ולא טבלה אחת: שני קהלים נפרדים לגמרי. מי שהשאיר מייל
// בדף ההמתנה הביע עניין אך אולי לא קנה; מי שהזמין ספרים מסר מייל
// בצ'קאאוט אך אולי מעולם לא ראה את דף ההמתנה. ניוזלטר שמדלג על אחד
// מהם מפספס את מחצית הקהל.
//
// ⚠️ כתובת שמופיעה בשני המקורות היא *שורה אחת* עם שני הסימונים, ולא
// שתיים. כפילות ברשימת תפוצה פירושה שאדם מקבל את אותו מייל פעמיים,
// וזה הדבר שהכי מהר גורם לסימון כספאם.
// ─────────────────────────────────────────────────────────────────────────────

import { cleanEmail, isValidEmail } from './emailAddress'

/** מקור הכתובת. 'both' = נרשם לתזכורת *וגם* הזמין. */
export type AudienceSource = 'reminder' | 'customer' | 'both'

export interface AudienceMember {
  email: string
  source: AudienceSource
  /** שם הלקוח, כשידוע. נרשמי תזכורת מוסרים מייל בלבד. */
  name: string | null
  /** מספר ההזמנות ששולמו. 0 לנרשם שלא קנה. */
  orders: number
  /** סך הרכישות באגורות, בניכוי זיכויים. */
  spentAgorot: number
  /** מתי נכנס לרשימה — ההרשמה או ההזמנה הראשונה, המוקדם מביניהם. */
  since: string
  /** מתי נשלחה אליו תזכורת הפתיחה. null = טרם. רלוונטי לנרשמים בלבד. */
  notifiedAt: string | null
}

export interface ReminderRow {
  email: string
  created_at: string
  notified_at: string | null
}

export interface OrderRow {
  customer_email: string | null
  customer_name: string | null
  status: string
  total_agorot: number
  refunded_agorot: number
  created_at: string
}

/**
 * סטטוסים שמעידים על רכישה אמיתית.
 *
 * ⚠️ הזמנה שלא שולמה אינה הופכת אדם ללקוח: היא נוצרת בלחיצה על
 * "לתשלום" וננטשת המונית. כלולה אותה רשימה בדיוק כמו בחישוב ההכנסות
 * במסך ההזמנות, כדי ששני המסכים לא יספרו אחרת.
 */
export const PAID_STATUSES = [
  'paid', 'picking', 'packed', 'shipped', 'delivered', 'partially_refunded',
] as const

/**
 * בונה את רשימת התפוצה המאוחדת.
 *
 * ⚠️ כתובות פסולות מסוננות כאן ולא בתצוגה: הן הגיעו מהזמנות טלפוניות
 * שהוקלדו במשרד, ושליחה אליהן רק פוגעת במוניטין השולח מול Resend.
 */
export function buildAudience(
  reminders: ReminderRow[],
  orders: OrderRow[],
): AudienceMember[] {
  const map = new Map<string, AudienceMember>()

  for (const r of reminders) {
    const email = cleanEmail(r.email)
    if (!isValidEmail(email)) continue
    map.set(email, {
      email,
      source: 'reminder',
      name: null,
      orders: 0,
      spentAgorot: 0,
      since: r.created_at,
      notifiedAt: r.notified_at,
    })
  }

  for (const o of orders) {
    if (!PAID_STATUSES.includes(o.status as typeof PAID_STATUSES[number])) continue
    const email = cleanEmail(o.customer_email)
    if (!isValidEmail(email)) continue

    const net = (o.total_agorot ?? 0) - (o.refunded_agorot ?? 0)
    const existing = map.get(email)

    if (existing) {
      existing.source = existing.source === 'reminder' ? 'both' : existing.source
      existing.orders += 1
      existing.spentAgorot += net
      // ⚠️ השם מהזמנה גובר על ריק, אך הזמנה מאוחרת אינה דורסת שם קיים:
      // הראשון שהוקלד הוא בדרך כלל המדויק.
      existing.name ??= o.customer_name?.trim() || null
      // ⚠️ המוקדם מנצח: "מאז" הוא תחילת הקשר, לא האירוע האחרון.
      if (o.created_at < existing.since) existing.since = o.created_at
    } else {
      map.set(email, {
        email,
        source: 'customer',
        name: o.customer_name?.trim() || null,
        orders: 1,
        spentAgorot: net,
        since: o.created_at,
        notifiedAt: null,
      })
    }
  }

  // ⚠️ מיון יורד לפי כניסה: החדשים למעלה, כמו בכל טבלאות המערכת.
  return [...map.values()].sort((a, b) => b.since.localeCompare(a.since))
}

export const AUDIENCE_SOURCE_LABELS: Record<AudienceSource, string> = {
  reminder: 'נרשם לתזכורת',
  customer: 'רוכש',
  both: 'נרשם ורכש',
}
