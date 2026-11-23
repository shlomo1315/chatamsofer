// תיבות שכל מייל אליהן מועבר ישירות למייל אישי, בלי שמירה במערכת.
export const PERSONAL_FORWARD: Record<string, string> = { 't@chasamsofer.info': '4363773@gmail.com' }

const SYSTEM_SENDER = /(^|[._-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce|bounces)@/i

// מחזיר את התיבה שמחייבת הפניה (t@...), או null.
//
// 🔴 שולח מהדומיין שלנו (y@, office@) כן מועבר: עובדים מעבירים ל-t@ פניות
// מהתיבות שלהם, וחסימת כל @chasamsofer.info השמיטה אותן בשקט (22.11).
// ⚠️ חסומים רק t@ עצמו (ההפניה יוצאת ממנו, ומייל חוזר אליו היה לולאה)
// וכתובות מערכת (החזרות ודיווחי כשל).
export function personalForwardHit(directRecipients: string[], fromEmail: string): string | null {
  const hit = directRecipients.map(a => a.toLowerCase().trim()).find(a => PERSONAL_FORWARD[a])
  if (!hit) return null
  const from = (fromEmail || '').toLowerCase().trim()
  if (!from || PERSONAL_FORWARD[from] || SYSTEM_SENDER.test(from)) return null
  return hit
}
