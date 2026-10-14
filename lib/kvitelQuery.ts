import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { KVITEL_CHANNELS, KVITEL_STATUSES, formatLine, isRequestType, type KvitelChannel, type KvitelStatus } from '@/lib/kvitel'

// ─────────────────────────────────────────────────────────────────────────────
// סינון ושליפה של בקשות הקוויטל — משותף למסך הניהול ולייצוא ה-Word,
// כדי שהקובץ יכיל בדיוק את מה שרואים במסך.
// ─────────────────────────────────────────────────────────────────────────────

export interface KvitelLineRow {
  id: string; position: number; name: string; relation: string; parent_name: string
  request_type: string; request_note: string | null; flagged: boolean; flag_reason: string | null
}
export interface KvitelRequestRow {
  id: string; channel: KvitelChannel; status: KvitelStatus
  contact_name: string | null; contact_phone: string | null; contact_email: string | null
  raw_text: string | null; recording_url: string | null; note: string | null; submitted_at: string; done_at: string | null
  kvitel_request_lines: KvitelLineRow[]
}

// status: 'open' (ברירת מחדל: כל מה שטרם נשלח לציון — לבדיקה + ממתין) / 'all' / סטטוס בודד.
export interface KvitelFilters {
  from: string | null; to: string | null
  status: 'open' | 'all' | KvitelStatus
  channel: KvitelChannel | null
  type: string | null
  q: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export function parseKvitelFilters(sp: Record<string, string | string[] | undefined>): KvitelFilters {
  const status = one(sp.status)
  const channel = one(sp.channel)
  const type = one(sp.type)
  return {
    from: DATE_RE.test(one(sp.from)) ? one(sp.from) : null,
    to: DATE_RE.test(one(sp.to)) ? one(sp.to) : null,
    status: status === 'all' || status in KVITEL_STATUSES ? (status as KvitelFilters['status']) : 'open',
    channel: channel in KVITEL_CHANNELS ? (channel as KvitelChannel) : null,
    type: isRequestType(type) ? type : null,
    q: one(sp.q).trim().slice(0, 60),
  }
}

// תאריך ההגשה לפי שעון ישראל (YYYY-MM-DD) — "היום" של הצוות, לא של UTC.
export function israelDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(iso))
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/[\s'"׳״-]/g, '')

// סינון בזיכרון: תאריך מדויק, סוג בקשה וחיפוש חופשי (שם המגיש, טלפון, מייל, שם ושם האם).
// בסוג בקשה — נשארות רק השורות מהסוג, ובקשה בלי שורות כאלה יורדת.
// בקשה שהגיעה בלי שורות בכלל (מייל או הקלטה שלא פוענחו) נשארת, כדי שהצוות יראה אותה.
export function applyKvitelFilters(rows: KvitelRequestRow[], f: KvitelFilters): KvitelRequestRow[] {
  const q = norm(f.q)
  return rows.flatMap(r => {
    const day = israelDay(r.submitted_at)
    if (f.from && day < f.from) return []
    if (f.to && day > f.to) return []
    let lines = [...r.kvitel_request_lines].sort((a, b) => a.position - b.position)
    if (f.type) lines = lines.filter(l => l.request_type === f.type)
    if (q) {
      const contactHit = [r.contact_name, r.contact_phone, r.contact_email].some(v => norm(v).includes(q))
      if (!contactHit) lines = lines.filter(l => norm(l.name).includes(q) || norm(l.parent_name).includes(q))
    }
    if (!lines.length && (r.kvitel_request_lines.length || f.type || q)) return []
    return [{ ...r, kvitel_request_lines: lines }]
  })
}

export async function loadKvitelRequests(db: SupabaseClient, f: KvitelFilters): Promise<{ rows: KvitelRequestRow[]; error: string | null }> {
  // גבולות התאריך במסד ביום מרווח (אזור הזמן), והחיתוך המדויק ב-applyKvitelFilters.
  const pad = (d: string, days: number) => new Date(Date.parse(d + 'T00:00:00Z') + days * 86_400_000).toISOString()
  const { rows, error } = await fetchAllRows<KvitelRequestRow>((from, to) => {
    let q = db.from('kvitel_requests')
      .select('id, channel, status, contact_name, contact_phone, contact_email, raw_text, recording_url, note, submitted_at, done_at, kvitel_request_lines(id, position, name, relation, parent_name, request_type, request_note, flagged, flag_reason)')
      .order('submitted_at', { ascending: false })
    if (f.status === 'open') q = q.in('status', ['review', 'pending'])
    else if (f.status !== 'all') q = q.eq('status', f.status)
    if (f.channel) q = q.eq('channel', f.channel)
    if (f.from) q = q.gte('submitted_at', pad(f.from, -1))
    if (f.to) q = q.lt('submitted_at', pad(f.to, 2))
    return q.range(from, to) as unknown as PromiseLike<{ data: KvitelRequestRow[] | null; error: { message: string } | null }>
  })
  return { rows: applyKvitelFilters(rows, f), error }
}

// השורות לקובץ ה-Word: כל הערוצים יחד, רק "ממתין לשליחה" ו"נשלח לציון", בסדר קבוע —
// מהישן לחדש לפי זמן ההגשה, ובזמן זהה לפי מזהה הבקשה; בתוך בקשה לפי סדר השורות.
// כך ייצוא חוזר של אותו סינון נותן בדיוק את אותו קובץ.
export function kvitelExportLines(rows: KvitelRequestRow[], ids?: Set<string>): string[] {
  return rows
    .filter(r => (ids?.size ? ids.has(r.id) : true) && (r.status === 'pending' || r.status === 'done'))
    .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap(kvitelRequestLines)
}

// השורות של בקשה אחת, כפי שייכתבו בקובץ (גם לתצוגה המקדימה בכרטיס).
export function kvitelRequestLines(r: KvitelRequestRow): string[] {
  return [...r.kvitel_request_lines].sort((a, b) => a.position - b.position).map(l => formatLine({
    name: l.name, relation: l.relation, parentName: l.parent_name, requestType: l.request_type, requestNote: l.request_note,
  }))
}
