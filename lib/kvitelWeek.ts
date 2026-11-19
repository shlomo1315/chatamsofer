import { KVITEL_CHANNELS, type KvitelChannel } from '@/lib/kvitel'
import { shabbatLabel } from '@/lib/kvitelDocLayout'
import { israelDay, kvitelExportLines, type KvitelRequestRow } from '@/lib/kvitelQuery'
import { hebrewDay, pendingForPrint } from '@/lib/kvitelView'

// ─────────────────────────────────────────────────────────────────────────────
// מסך "השבוע" של הקוויטלאך (app/admin/kvitel/KvitelWeek.tsx): שבוע = ראשון עד שבת לפי שעון ישראל,
// והוא נקרא על שם הפרשה של אותה שבת. ימים כ-YYYY-MM-DD, כמו israelDay.
// ⚠️ שעת הסגירה (יום ו׳ ב-12:00) היא הנחה של המסך — אין בקוד שעת סגירה קבועה.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000
export const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10)
const weekday = (day: string) => new Date(day + 'T00:00:00Z').getUTCDay()   // 0 = ראשון … 6 = שבת

// השבת שבתאריך או אחריו
export const shabbatOf = (day: string) => addDays(day, 6 - weekday(day))

export interface KvitelWeekInfo {
  shabbat: string; from: string; to: string
  parsha: string      // "ויצא" (בשבת של חג: "שבת")
  label: string       // 'ערש״ק פרשת ויצא תשפ״ז'
}

export function kvitelWeek(shabbat: string): KvitelWeekInfo {
  const raw = shabbatLabel(new Date(shabbat + 'T12:00:00Z'))
  const m = /^ערש"ק פרשת (.+) \S+$/.exec(raw)
  return { shabbat, from: addDays(shabbat, -6), to: shabbat, parsha: m ? m[1] : 'שבת', label: raw.replace(/"/g, '״') }
}

// ארבעת השבועות האחרונים, מהישן לחדש — האחרון הוא השבוע של היום.
export function recentWeeks(today: string, n = 4): KvitelWeekInfo[] {
  const cur = shabbatOf(today)
  return Array.from({ length: n }, (_, i) => kvitelWeek(addDays(cur, (i - n + 1) * 7)))
}

const inWeek = (iso: string | null, w: KvitelWeekInfo) => {
  if (!iso) return false
  const d = israelDay(iso)
  return d >= w.from && d <= w.to
}

// סדר הערוצים כמו בעיצוב
export const CHANNEL_ORDER: KvitelChannel[] = ['web', 'nedarim', 'phone', 'email']

// "נכנסו השבוע": כל מה שהוגש בשבוע, לפי ערוץ.
export function weekIntake(rows: KvitelRequestRow[], w: KvitelWeekInfo) {
  const inside = rows.filter(r => inWeek(r.submitted_at, w))
  const byChannel = CHANNEL_ORDER.map(channel => ({ channel, label: KVITEL_CHANNELS[channel], n: inside.filter(r => r.channel === channel).length }))
  return { total: inside.length, byChannel }
}

// "נשלח לציון": בקשות שסומנו כנשלחו בתוך השבוע. at = הסימון האחרון.
export function weekSent(rows: KvitelRequestRow[], w: KvitelWeekInfo): { count: number; at: string | null } {
  const sent = rows.filter(r => r.status === 'done' && inWeek(r.done_at, w))
  const at = sent.reduce<string | null>((max, r) => (!max || Date.parse(r.done_at!) > Date.parse(max) ? r.done_at : max), null)
  return { count: sent.length, at }
}

// מספר עמודי ה-A4 של הקובץ (lib/kvitelPdf.ts): 19 שורות בעמוד הראשון (מתחת לכותרת והלוגו), 24 בכל עמוד נוסף.
// ⚠️ הערכה: שורה ארוכה במיוחד נשברת לשתיים בקובץ.
export const FIRST_PAGE_LINES = 19
export const PAGE_LINES = 24
export function kvitelPages(lines: number): number {
  if (lines <= 0) return 0
  return lines <= FIRST_PAGE_LINES ? 1 : 1 + Math.ceil((lines - FIRST_PAGE_LINES) / PAGE_LINES)
}

// "בקובץ": מה שייצא בסגירה — רק "לא נשלח" עם שמות ("לבדיקה" לא נכנס).
export function kvitelFile(rows: KvitelRequestRow[]) {
  const list = pendingForPrint(rows)
  const lines = kvitelExportLines(list)
  return { ids: list.map(r => r.id), lines, pages: kvitelPages(lines.length) }
}

// הרגע של יום ו׳ 12:00 בשעון ישראל (חורף +2, קיץ +3).
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' })
export function closeAt(w: KvitelWeekInfo): number {
  const t = Date.parse(addDays(w.shabbat, -1) + 'T10:00:00Z')
  return t - (Number(hourFmt.format(new Date(t))) - 12) * 3_600_000
}

// "עוד N שעות" עד הסגירה; null כשהיא כבר עברה.
export function hoursToClose(w: KvitelWeekInfo, now = Date.now()): number | null {
  const h = Math.ceil((closeAt(w) - now) / 3_600_000)
  return h > 0 ? h : null
}

const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
// "ו׳" — היום בשבוע לפי שעון ישראל
export const weekdayHe = (iso: string) => DAYS[weekday(israelDay(iso))]

// "נסגר ביום ו׳, י׳ כסלו"
export const closeLabel = (w: KvitelWeekInfo) => `ביום ו׳, ${hebrewDay(new Date(closeAt(w)).toISOString())}`

// "נשלחו ביום ו׳ ג׳ כסלו"
export const sentLabel = (iso: string) => `ביום ${weekdayHe(iso)} ${hebrewDay(iso)}`

// "052-•••-4417"
export function maskPhone(p: string | null | undefined): string {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 9 ? `${d.slice(0, 3)}-•••-${d.slice(-4)}` : (p ?? '')
}

// "היום 08:12" / "אתמול 21:40" / "ג׳ 14:20" (השבוע) / "כ״ה חשוון"
const timeFmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export function whenLabel(iso: string, now = Date.now()): string {
  const day = israelDay(iso)
  const today = israelDay(new Date(now).toISOString())
  const time = timeFmt.format(new Date(iso))
  if (day === today) return `היום ${time}`
  if (day === addDays(today, -1)) return `אתמול ${time}`
  if (day > addDays(today, -7)) return `${weekdayHe(iso)} ${time}`
  return hebrewDay(iso)
}
