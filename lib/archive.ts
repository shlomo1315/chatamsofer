// מחלקת הארכיון — לוגיקה טהורה (בלי מסד ובלי רשת), כדי שאפשר לבדוק אותה.
// המסך: app/admin/archive · ה-API: app/api/admin/archive · מיגרציה: 20261101_archive.sql
import { HDate, gematriya } from '@hebcal/core'

export const ARCHIVE_EVENT_TYPES = [
  { name: 'הילולא', color: '#f59e0b' },
  { name: 'כינוס', color: '#6366f1' },
  { name: 'סיום', color: '#10b981' },
  { name: 'חלוקה', color: '#ef4444' },
  { name: 'שמחה', color: '#ec4899' },
  { name: 'אחר', color: '#64748b' },
] as const

export function eventTypeColor(name: string): string {
  return ARCHIVE_EVENT_TYPES.find(t => t.name === name)?.color ?? '#64748b'
}

export function isEventType(name: unknown): name is string {
  return typeof name === 'string' && ARCHIVE_EVENT_TYPES.some(t => t.name === name)
}

export interface ArchiveEvent {
  id: string
  name: string
  event_date: string // YYYY-MM-DD
  hebrew_date: string // למשל: כ״ה תשרי תשפ״ז
  hebrew_year: string // למשל: תשפ״ז
  event_type: string
  place: string | null
  description: string | null
  photo_count: number
  video_count: number
  cover_file_ids: string[]
  drive_folder_id: string | null
}

export interface ArchiveFile {
  id: string
  event_id: string
  name: string
  kind: 'image' | 'video'
  mime: string | null
  size_bytes: number | null
  width: number | null
  height: number | null
  duration_sec: number | null
  has_thumb: boolean
  drive_file_id?: string
}

const stripNikud = (s: string) => s.replace(/־/g, ' ').replace(/[֑-ׇ]/g, '')

/** תאריך עברי מתאריך לועזי (YYYY-MM-DD). מחזיר null אם התאריך לא תקין. */
export function hebrewFromIso(iso: string): { date: string; year: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))
  if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1) return null
  // ⚠️ צהריים UTC, כדי שאזור הזמן של השרת לא יזיז את היום.
  const hd = new HDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const full = stripNikud(hd.renderGematriya()) // "כ״ה תשרי תשפ״ז"
  const year = stripNikud(gematriya(hd.getFullYear() % 1000))
  return { date: full, year }
}

export interface ArchiveFilters { year: string | null; type: string | null; q: string }

export function filterEvents(events: ArchiveEvent[], f: ArchiveFilters): ArchiveEvent[] {
  const q = f.q.trim()
  return events.filter(e =>
    (!f.year || e.hebrew_year === f.year) &&
    (!f.type || e.event_type === f.type) &&
    (!q || `${e.name} ${e.event_type} ${e.hebrew_date} ${e.place ?? ''} ${e.description ?? ''} ${e.event_date}`.includes(q)),
  )
}

/** קיבוץ לפי שנה עברית, השנים והאירועים מהחדש לישן (לפי תאריך לועזי). */
export function groupByYear(events: ArchiveEvent[]): { year: string; events: ArchiveEvent[] }[] {
  const sorted = [...events].sort((a, b) => b.event_date.localeCompare(a.event_date))
  const out: { year: string; events: ArchiveEvent[] }[] = []
  for (const e of sorted) {
    const last = out[out.length - 1]
    if (last && last.year === e.hebrew_year) last.events.push(e)
    else out.push({ year: e.hebrew_year, events: [e] })
  }
  return out
}

export function latestEvent(events: ArchiveEvent[]): ArchiveEvent | null {
  return events.reduce<ArchiveEvent | null>((a, e) => (!a || e.event_date > a.event_date ? e : a), null)
}

/** שם קובץ בטוח ל-Drive ולכותרות HTTP (בלי מפרידי נתיב ותווי בקרה). */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/\u0000-\u001f\u007f"]/g, '_').trim().slice(0, 180)
  return cleaned || 'file'
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i
const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv|webm|3gp|wmv|mts)$/i

/** סוג הקובץ לפי ה-MIME, ובהיעדרו לפי הסיומת. null = לא נתמך. */
export function detectKind(name: string, mime: string | null | undefined): 'image' | 'video' | null {
  if (mime?.startsWith('image/')) return 'image'
  if (mime?.startsWith('video/')) return 'video'
  if (IMAGE_EXT.test(name)) return 'image'
  if (VIDEO_EXT.test(name)) return 'video'
  return null
}

export function formatBytes(n: number): string {
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)}GB`
  if (n >= 1048576) return `${Math.round(n / 1048576)}MB`
  return `${Math.max(1, Math.round(n / 1024))}KB`
}

export function formatDuration(sec: number | null): string {
  if (!sec || sec < 0) return ''
  const m = Math.floor(sec / 60)
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

/** מזהה קובץ בארכיון — uuid בלבד, כדי שלא ייכנס נתיב לדיסק. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
