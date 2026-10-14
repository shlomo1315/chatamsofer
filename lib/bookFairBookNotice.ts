// ─────────────────────────────────────────────────────────────────────────────
// הודעה למזמיני ספר אחד: שיחה טלפונית (TTS בימות) ומייל (14.10).
//
// המקרה שהוליד את זה: ספר שלא סופק (חוסר אצל המפיץ), וכל מי שהזמין אותו
// צריך לשמוע על כך בטלפון ובמייל.
//
// 🔴 בלי טבלה חדשה: כל ערוץ נרשם כדיוור ב-book_fair_newsletters
// (audience = book_notice:<מזהה ספר>:<ערוץ>), וכל נמען ב-
// book_fair_newsletter_recipients. בערוץ הטלפון עמודת email מחזיקה את
// מספר הטלפון המנורמל. כך אין מיגרציה ידנית, ויש תיעוד מי קיבל.
//
// 🔴 מניעת כפילות: מי שמסומן 'sent' באחד מהדיוורים של אותו ספר ואותו ערוץ
// לא יקבל שוב, גם אם לוחצים "שליחה" פעם נוספת.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizePhone } from '@/lib/phone'

export type NoticeChannel = 'email' | 'phone'

/** הזמנות חיות בלבד: מבוטלת/נכשלה לא שולמה, ומזוכה במלואה כבר טופלה. */
export const LIVE_STATUSES = ['paid', 'picking', 'packed', 'shipped', 'delivered', 'partially_refunded']

export function noticeAudience(bookId: string, channel: NoticeChannel): string {
  return `book_notice:${bookId}:${channel}`
}

export interface NoticeOrder {
  order_number: string
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  tracking_token: string | null
  total_agorot: number | null
}

export interface NoticeTarget {
  /** מייל באותיות קטנות, או טלפון מנורמל. */
  key: string
  name: string | null
  orders: { orderNumber: string; totalAgorot: number; token: string | null }[]
}

export interface NoticeScope {
  /** הזמנות חיות שהספר בתוכן. */
  orders: number
  email: NoticeTarget[]
  phone: NoticeTarget[]
  /** הזמנות בלי מייל תקין ובלי טלפון תקין. */
  noContact: { orderNumber: string; name: string | null; phone: string | null; email: string | null }[]
  /** הזמנות עם טלפון בלבד / מייל בלבד — לתצוגה. */
  phoneOnly: number
  emailOnly: number
}

export function cleanEmail(raw: string | null | undefined): string | null {
  const e = String(raw ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

/** טלפון ישראלי שאפשר לחייג אליו: 9-10 ספרות שמתחילות ב-0. */
export function cleanPhone(raw: string | null | undefined): string | null {
  const p = normalizePhone(raw)
  return /^0\d{8,9}$/.test(p) ? p : null
}

function addTo(map: Map<string, NoticeTarget>, key: string, o: NoticeOrder) {
  const t = map.get(key) ?? { key, name: null, orders: [] }
  if (o.customer_name?.trim()) t.name = o.customer_name.trim()
  if (!t.orders.some(x => x.orderNumber === o.order_number)) {
    t.orders.push({ orderNumber: o.order_number, totalAgorot: o.total_agorot ?? 0, token: o.tracking_token })
  }
  map.set(key, t)
}

/**
 * מקבץ את ההזמנות לנמענים: מייל אחד לכל כתובת ושיחה אחת לכל מספר,
 * גם כשלאותו אדם כמה הזמנות. מי שכבר קיבל (sent) לא נכלל.
 */
export function scopeBookNotice(
  orders: NoticeOrder[],
  alreadySent: { email: Set<string>; phone: Set<string> } = { email: new Set(), phone: new Set() },
): NoticeScope {
  const email = new Map<string, NoticeTarget>()
  const phone = new Map<string, NoticeTarget>()
  const noContact: NoticeScope['noContact'] = []
  let phoneOnly = 0, emailOnly = 0

  for (const o of orders) {
    const e = cleanEmail(o.customer_email)
    const p = cleanPhone(o.customer_phone)
    if (!e && !p) {
      noContact.push({ orderNumber: o.order_number, name: o.customer_name, phone: o.customer_phone, email: o.customer_email })
      continue
    }
    if (p && !e) phoneOnly++
    if (e && !p) emailOnly++
    if (e && !alreadySent.email.has(e)) addTo(email, e, o)
    if (p && !alreadySent.phone.has(p)) addTo(phone, p, o)
  }

  return { orders: orders.length, email: [...email.values()], phone: [...phone.values()], noContact, phoneOnly, emailOnly }
}

export const DEFAULT_SUBJECT = (title: string) => `עדכון על הספר "${title}" שהזמנתם — יריד ספרי החתם סופר`

export const DEFAULT_EMAIL_MESSAGE = (title: string) => `ברצוננו לעדכן אתכם, שבעקבות חוסר שנוצר אצל מפיץ הספרים, ולמרות כל המאמצים מצידנו, לא עלה בידינו לשלוח את הספר "${title}" למזמינים.

נעדכן אתכם בהמשך לגבי החזר הכסף.

אנו מבקשים את סליחתכם על אי הנעימות.

בברכה מרובה
היכל החתם סופר`

/**
 * ⚠️ בלי פסיקים ובלי נקודות: ימות מפצלת את הטקסט האישי בפסיקים וקוטעת
 * את ההודעה, ומשהה ~15 שניות לפני נקודה (ראו lib/yemotCall). ממילא
 * placeTtsCall מסיר אותם, אבל הטקסט נכתב כך מראש כדי שיישמע טבעי.
 */
export const DEFAULT_PHONE_MESSAGE = (title: string) =>
  `שלום כאן היכל החתם סופר בעניין הזמנתכם ביריד הספרים ; ` +
  `ברצוננו לעדכן שבעקבות חוסר שנוצר אצל מפיץ הספרים ולמרות כל המאמצים מצידנו ` +
  `לא עלה בידינו לשלוח את הספר ${title.replace(/["'״׳]/g, '')} למזמינים ; ` +
  `נעדכן אתכם בהמשך לגבי החזר הכסף ; תודה רבה ובבקשת סליחה`
