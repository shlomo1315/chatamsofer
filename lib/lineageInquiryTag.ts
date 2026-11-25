// ── בירור סדר הדורות: התווית ליד השם ──
// "נשלח לבירור": נשלח למשפחה קישור לתיקון (lineage_link_sent_at), והיא עוד לא השיבה.
// "חזר מבירור - בדיקה מעמיקה": המשפחה השיבה דרך הקישור (lineage_inquiry_returned_at),
// והסדר שלה עדיין לא תואם את הקובץ — למשל התעקשה על אב שלא ידוע לנו. נדרש אישור ידני.
// מי שתיקן ותואם עובר ל-pending (lib/lineageChainSave), ואז אין תווית.
// 🔴 בלי תלות בקוד שרת: נטען גם בדפדפן. השליחה עצמה ב-lib/lineageInquiry.

/** תוקף הקישור. מי שקיבל קישור בתקופה הזו לא מקבל שוב אוטומטית. */
export const LINEAGE_LINK_DAYS = 30

export type LineageInquiryTag = { kind: 'sent' | 'returned'; label: string }

export interface InquiryRow {
  eligibility_status?: string | null
  lineage_link_sent_at?: string | null
  lineage_inquiry_returned_at?: string | null
}

export function lineageInquiryTag(row: InquiryRow): LineageInquiryTag | null {
  if (row.eligibility_status !== 'deep_review' || !row.lineage_link_sent_at) return null
  const returned = row.lineage_inquiry_returned_at
  // תשובה שקדמה לקישור האחרון לא נחשבת תשובה לבירור הנוכחי.
  if (returned && Date.parse(returned) >= Date.parse(row.lineage_link_sent_at)) return { kind: 'returned', label: 'חזר מבירור - בדיקה מעמיקה' }
  return { kind: 'sent', label: 'נשלח לבירור' }
}

export function linkSentRecently(sentAt: string | null | undefined, now = Date.now()): boolean {
  if (!sentAt) return false
  const t = Date.parse(sentAt)
  return Number.isFinite(t) && now - t < LINEAGE_LINK_DAYS * 86400_000
}
