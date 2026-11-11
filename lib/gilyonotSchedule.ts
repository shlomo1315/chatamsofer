// בדיקת זמן שליחה מתוזמנת של גיליון. טהור, בלי מסד, כדי שאפשר לבדוק.

const MIN_LEAD_MS = 2 * 60 * 1000
const MAX_LEAD_MS = 366 * 24 * 60 * 60 * 1000

export function parseScheduleAt(raw: unknown, now = new Date()): { ok: true; at: Date } | { ok: false; error: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'בחרו תאריך ושעה לשליחה' }
  const at = new Date(raw)
  if (Number.isNaN(at.getTime())) return { ok: false, error: 'תאריך או שעה לא תקינים' }
  if (at.getTime() < now.getTime() + MIN_LEAD_MS) return { ok: false, error: 'הזמן חייב להיות בעתיד (לפחות עוד שתי דקות)' }
  if (at.getTime() > now.getTime() + MAX_LEAD_MS) return { ok: false, error: 'אפשר לתזמן עד שנה קדימה' }
  return { ok: true, at }
}
