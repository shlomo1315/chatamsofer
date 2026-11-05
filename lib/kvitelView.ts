import type { KvitelRequestRow } from '@/lib/kvitelQuery'
import type { KvitelStatus } from '@/lib/kvitel'

// עזרים לתצוגת מסך הקוויטלאך: סיבת בדיקה, תאריך עברי, ספירת סטטוסים ופענוח "הנתונים הגולמיים".

// למה הבקשה ממתינה לבדיקה, במילים קצרות. null כשהכול תקין.
export function reviewReason(r: Pick<KvitelRequestRow, 'contact_name' | 'contact_phone' | 'contact_email' | 'kvitel_request_lines'>): string | null {
  const ls = r.kvitel_request_lines
  if (!ls.length) return 'לא נקלטו שמות'
  if (ls.some(l => !l.name?.trim() || !l.parent_name?.trim())) return 'שם חסר'
  const flagged = ls.find(l => l.flagged)
  if (flagged) return flagged.flag_reason || 'שורה לבדיקה'
  if (!r.contact_name?.trim() && !r.contact_phone && !r.contact_email) return 'מגיש לא ידוע'
  return null
}

// שורה שחסר בה שם או שם האם.
export const lineMissing = (l: { name: string; parent_name: string }) => !l.name?.trim() || !l.parent_name?.trim()

const hebrewFmt = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long' })
// "כ״ה חשוון" — היום והחודש העברי לפי שעון ישראל. ריק כשהתאריך לא תקין.
export function hebrewDay(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  const m = /^(\d+) ב?(.+)$/.exec(hebrewFmt.format(d))
  return m ? `${gematria(Number(m[1]))} ${m[2]}` : ''
}

// מספר היום באותיות: 25 → כ״ה, 15 → ט״ו, 30 → ל׳
function gematria(n: number): string {
  const tens = ['', 'י', 'כ', 'ל']
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
  const s = n === 15 ? 'טו' : n === 16 ? 'טז' : tens[Math.floor(n / 10)] + ones[n % 10]
  return s.length > 1 ? `${s.slice(0, -1)}״${s.slice(-1)}` : `${s}׳`
}

export type StatusCounts = Record<KvitelStatus | 'all', number>
export function countByStatus(rows: Pick<KvitelRequestRow, 'status'>[]): StatusCounts {
  const c: StatusCounts = { all: rows.length, review: 0, pending: 0, done: 0, cancelled: 0 }
  for (const r of rows) c[r.status] += 1
  return c
}

// raw_text נשמר כשורות "שדה: ערך" (הגשת נדרים). טקסט חופשי בלי נקודתיים לא נחשב שדות.
export function parseRawFields(raw: string | null | undefined): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = []
  for (const line of (raw ?? '').split(/\r?\n/)) {
    const m = /^\s*([^:\n]{1,40}):\s*(.*)$/.exec(line)
    if (m && m[2].trim()) out.push({ key: m[1].trim(), value: m[2].trim() })
  }
  return out
}
