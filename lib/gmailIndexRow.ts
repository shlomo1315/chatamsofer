// ─────────────────────────────────────────────────────────────────────────────
// המרת הודעת Gmail לשורת אינדקס — הלוגיקה הטהורה.
//
// 🔴 מה *לא* נכנס לכאן: גוף ההודעה. האינדקס מחזיק מצביע ומטא-דאטה, והגוף
// נקרא מ-Gmail לפי דרישה. עמודת גוף הייתה הופכת את הטבלה לעותק שלישי של
// ההודעה — בדיוק הכפילות שהמעבר ל-Gmail נועד לסלק.
//
// המודול טהור כדי שהמיפוי — ובעיקר זיהוי המחלקה — ייבדק בלי Gmail ובלי מסד.
// ─────────────────────────────────────────────────────────────────────────────

import { UNREAD_LABEL } from './gmailHistorySync'

/** החלקים מ-ParsedMessage שהאינדקס צורך. */
export interface IndexSource {
  id: string
  threadId?: string | null
  subject?: string | null
  from?: string | null
  fromEmail?: string | null
  toEmail?: string | null
  date?: string | null
  snippet?: string | null
  labelIds?: string[] | null
  attachments?: unknown[] | null
  /**
   * הכתובת שאליה נשלח המייל במקור, מכותרת X-Gm-Original-To.
   * ⚠️ כלל הניתוב של Workspace מוסיף אותה, והיא הדרך היחידה לדעת לאיזו
   * מחלקה המייל שייך אחרי שהוא נותב לתיבה משותפת: toEmail כבר משקף את
   * היעד שאחרי הניתוב, לא את מה שהשולח הקליד.
   */
  originalTo?: string | null
}

export interface IndexRow {
  gmail_message_id: string
  thread_id: string | null
  from_email: string | null
  from_name: string | null
  to_email: string | null
  original_to: string | null
  subject: string | null
  snippet: string | null
  sent_at: string | null
  has_attachments: boolean
  is_unread: boolean
  labels: string[]
  synced_at: string
}

const clean = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  return s ? s : null
}

/** כתובת בלבד, מתוך "שם <כתובת>" או כתובת חשופה. */
export function extractEmail(raw: unknown): string | null {
  const s = String(raw ?? '')
  const angled = s.match(/<([^>]+)>/)
  const addr = (angled ? angled[1] : s).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+$/.test(addr) ? addr : null
}

/** השם שלפני הכתובת ב-"שם <כתובת>", בלי גרשיים. */
export function extractName(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s.includes('<')) return null
  // ⚠️ trim לפני הסרת הגרשיים: יש רווח בין הגרש הסוגר ל-<, ובלי הסדר הזה
  // הגרש נשאר בשם המוצג.
  return clean(s.slice(0, s.indexOf('<')).trim().replace(/^["']|["']$/g, ''))
}

/**
 * לאיזו מחלקה שייך המייל.
 *
 * ⚠️ הסדר אינו שרירותי: X-Gm-Original-To קודם ל-toEmail, כי הוא מה שהשולח
 * באמת הקליד. אחרי ניתוב לתיבה משותפת, toEmail מצביע על היעד המשותף — וכל
 * המחלקות היו נראות כמחלקה אחת.
 *
 * @param byAddress מיפוי כתובת → מפתח מחלקה.
 */
export function departmentFor(
  src: IndexSource,
  byAddress: Map<string, string>,
): string | null {
  for (const candidate of [src.originalTo, src.toEmail]) {
    const addr = extractEmail(candidate)
    if (addr && byAddress.has(addr)) return byAddress.get(addr)!
  }
  return null
}

/**
 * ממיר הודעה לשורת אינדקס.
 *
 * ⚠️ is_unread נגזר מהתווית UNREAD ולא משדה נגזר אחר: זו התווית שהיא מקור
 * האמת ב-Gmail, והיא זו שמשתנה כשקוראים בטלפון. כל גזירה אחרת הייתה מתפצלת
 * ממה שהמשתמש רואה בגמייל עצמו.
 */
export function toIndexRow(src: IndexSource, now: string): IndexRow {
  const labels = (src.labelIds ?? []).filter(Boolean).map(String)
  return {
    gmail_message_id: src.id,
    thread_id: clean(src.threadId),
    from_email: extractEmail(src.fromEmail ?? src.from),
    from_name: extractName(src.from),
    to_email: extractEmail(src.toEmail),
    original_to: extractEmail(src.originalTo),
    subject: clean(src.subject),
    snippet: clean(src.snippet),
    sent_at: toIso(src.date),
    has_attachments: (src.attachments?.length ?? 0) > 0,
    is_unread: labels.includes(UNREAD_LABEL),
    labels,
    synced_at: now,
  }
}

/**
 * תאריך ההודעה כ-ISO, או null.
 *
 * ⚠️ תאריך לא תקין מוחזר כ-null ולא כ"עכשיו": הודעה עם תאריך פגום הייתה
 * קופצת לראש התיבה בכל סנכרון מחדש.
 */
export function toIso(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
