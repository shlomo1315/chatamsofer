// ─────────────────────────────────────────────────────────────────────────────
// פילוח שליחה של גיליון: מונים, ומצטבר לאורך זמן לגרף (לפי שעה, או לפי יום
// כשעברו יותר משלושה ימים). פונקציה טהורה, בלי מסד, כדי שאפשר לבדוק אותה.
// ─────────────────────────────────────────────────────────────────────────────

export interface DeliveryStatRow {
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  delivered_at: string | null
  opened_at: string | null
  downloaded_at: string | null
  bounced_at: string | null
  complained_at: string | null
  clicked_at?: string | null
  unsubscribed_at?: string | null
}

export const STAT_KEYS = ['sent', 'delivered', 'opened', 'clicked', 'downloaded', 'unsubscribed', 'bounced', 'complained'] as const
export type StatKey = typeof STAT_KEYS[number]

export interface IssueStats {
  total: number
  pending: number
  failed: number
  counts: Record<StatKey, number>
  /** נקודות מצטברות: t = תחילת הדלי (ISO) */
  timeline: ({ t: string } & Record<StatKey, number>)[]
  bucket: 'hour' | 'day'
}

const HOUR = 3_600_000
const DAY = 24 * HOUR
const COL: Record<StatKey, keyof DeliveryStatRow> = {
  sent: 'sent_at', delivered: 'delivered_at', opened: 'opened_at',
  downloaded: 'downloaded_at', bounced: 'bounced_at', complained: 'complained_at',
  clicked: 'clicked_at', unsubscribed: 'unsubscribed_at',
}

export function buildIssueStats(rows: DeliveryStatRow[], now: Date = new Date()): IssueStats {
  const counts = Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Record<StatKey, number>
  let pending = 0, failed = 0, first = Infinity
  const times: { key: StatKey; at: number }[] = []
  for (const r of rows) {
    if (r.status === 'pending') pending++
    if (r.status === 'failed') failed++
    for (const key of STAT_KEYS) {
      const v = r[COL[key]]
      if (!v) continue
      const at = Date.parse(v as string)
      if (Number.isNaN(at)) continue
      counts[key]++
      times.push({ key, at })
      if (at < first) first = at
    }
  }

  if (!times.length) return { total: rows.length, pending, failed, counts, timeline: [], bucket: 'hour' }

  const end = Math.max(now.getTime(), ...times.map(x => x.at))
  const bucket = end - first > 3 * DAY ? 'day' : 'hour'
  const size = bucket === 'day' ? DAY : HOUR
  const start = Math.floor(first / size) * size
  const n = Math.min(Math.floor((end - start) / size) + 1, bucket === 'day' ? 120 : 72)
  const perBucket = Array.from({ length: n }, () => Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Record<StatKey, number>)
  for (const { key, at } of times) perBucket[Math.min(Math.floor((at - start) / size), n - 1)][key]++

  const run = Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Record<StatKey, number>
  const timeline = perBucket.map((b, i) => {
    for (const k of STAT_KEYS) run[k] += b[k]
    return { t: new Date(start + i * size).toISOString(), ...run }
  })
  return { total: rows.length, pending, failed, counts, timeline, bucket }
}
