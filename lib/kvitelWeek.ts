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

// ── השבוע מתחלף ב"שליחה לציון", לא לפי הלוח ──
// עד שליחה כל בקשה שייכת לשבוע הפתוח. אחרי שמנה נשלחה, השבוע הפתוח הוא הפרשה שאחריה,
// גם אם בלוח עוד לא הגענו אליה (נשלח ויצא ביום ה׳ ← בקשה חדשה כבר בוישלח).
// לבקשה עצמה אין פרשה שמורה: "לא נשלח" שייכת לשבוע הפתוח, ו"נשלח" למנה שבה נסגרה.

export interface KvitelBatchRef { closed_at: string; parsha: string | null }

// השבת שהמנה נשלחה עבורה: השבת הקרובה ליום הסגירה שהפרשה שלה היא הפרשה שנרשמה במנה.
// מנה בלי פרשה, או שלא נמצאה סביב יום הסגירה — השבת של יום הסגירה.
const SEARCH_WEEKS = [0, -1, 1, -2, 2, -3, 3, -4, -5, -6, -7, -8, -9, -10]
export function batchShabbat(b: KvitelBatchRef): string {
  const base = shabbatOf(israelDay(b.closed_at))
  if (b.parsha) {
    for (const k of SEARCH_WEEKS) {
      const sh = addDays(base, k * 7)
      if (kvitelWeek(sh).parsha === b.parsha) return sh
    }
  }
  return base
}

// השבוע הפתוח: הפרשה שאחרי המנה האחרונה. בלי מנות בכלל — השבוע של היום.
// לעולם לא יותר משבוע אחד לפני הלוח: מנה כפולה או סגירה נוספת באותו שבוע לא מקפיצות לפרשה שאחרי הבאה.
export function openKvitelWeek(last: KvitelBatchRef | null, today: string): KvitelWeekInfo {
  const cur = shabbatOf(today)
  if (!last) return kvitelWeek(cur)
  const next = addDays(batchShabbat(last), 7)
  const max = addDays(cur, 7)
  return kvitelWeek(next > max ? max : next)
}

// לשונית במסך: מנה שנשלחה, או השבוע הפתוח (batch = null, תמיד האחרונה).
// since/until = גבולות הקליטה: הסגירה הקודמת עד הסגירה הזו. since חסר → מתחילת השבוע בלוח.
export interface KvitelWeekTab<B extends KvitelBatchRef = KvitelBatchRef> {
  week: KvitelWeekInfo; since: string | null; until: string | null; batch: B | null
}

// batches מהחדשה לישנה (כמו ב-GET של המנות). מחזיר מהישן לחדש: n-1 מנות ואז השבוע הפתוח.
export function kvitelWeekTabs<B extends KvitelBatchRef>(batches: B[], today: string, n = 4): KvitelWeekTab<B>[] {
  const sent = batches.slice(0, n - 1).map((b, i) => ({
    week: kvitelWeek(batchShabbat(b)), since: batches[i + 1]?.closed_at ?? null, until: b.closed_at, batch: b,
  })).reverse()
  return [...sent, { week: openKvitelWeek(batches[0] ?? null, today), since: batches[0]?.closed_at ?? null, until: null, batch: null }]
}

const inTab = (iso: string | null, t: Pick<KvitelWeekTab, 'week' | 'since' | 'until'>) => {
  if (!iso) return false
  const at = Date.parse(iso)
  if (t.until && at > Date.parse(t.until)) return false
  return t.since ? at > Date.parse(t.since) : israelDay(iso) >= t.week.from
}

// סדר הערוצים כמו בעיצוב
export const CHANNEL_ORDER: KvitelChannel[] = ['web', 'nedarim', 'phone', 'email']

// "נכנסו השבוע": כל מה שהוגש מאז הסגירה הקודמת (ועד הסגירה של המנה), לפי ערוץ.
export function weekIntake(rows: KvitelRequestRow[], t: Pick<KvitelWeekTab, 'week' | 'since' | 'until'>) {
  const inside = rows.filter(r => inTab(r.submitted_at, t))
  const byChannel = CHANNEL_ORDER.map(channel => ({ channel, label: KVITEL_CHANNELS[channel], n: inside.filter(r => r.channel === channel).length }))
  return { total: inside.length, byChannel }
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

// המנה שנרשמת בסגירה (app/api/admin/kvitel/batches): מתוך המזהים שירדו בקובץ, רק מה שעדיין "לא נשלח"
// ויש בו שמות — כך בקשה שהוחזרה לבדיקה או כבר נשלחה בינתיים לא נרשמת פעמיים.
export function kvitelBatch(rows: KvitelRequestRow[], ids: string[]) {
  const want = new Set(ids)
  return kvitelFile(rows.filter(r => want.has(r.id)))
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
