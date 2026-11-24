import { buildIssueStats, type IssueStats } from '../gilyonotStats'
import { parseUserAgent } from './tracking'

// ─────────────────────────────────────────────────────────────────────────────
// דוח פילוח של קמפיין ניוזלטר. פונקציה טהורה, בלי מסד, כדי שאפשר לבדוק אותה.
// נמען = שורה ב-campaign_recipients; אירוע = שורה ב-email_events.
// פתיחות וקליקים של מכונות (Apple MPP, סורקי אבטחה) נספרים בנפרד ולא בפתיחות.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportRecipient {
  id: string
  email: string
  status: string
  sent_at: string | null
  delivered_at: string | null
  opened_at: string | null
  open_count: number | null
  clicked_at: string | null
  click_count: number | null
  bounced_at: string | null
  complained_at: string | null
  error: string | null
  merge_data: Record<string, unknown> | null
}

export interface ReportEvent {
  recipient_id: string | null
  event_type: string
  link_url: string | null
  user_agent: string | null
  created_at: string
  device?: string | null
  client?: string | null
  os?: string | null
  is_machine?: boolean | null
  machine_reason?: string | null
  raw?: Record<string, unknown> | null
}

export interface Breakdown { label: string; count: number }

export interface RecipientReport {
  id: string
  email: string
  name: string
  status: string
  sentAt: string | null
  firstOpen: string | null
  lastOpen: string | null
  openCount: number
  firstClick: string | null
  clickCount: number
  links: string[]
  device: string | null
  client: string | null
  os: string | null
  bounced: boolean
  complained: boolean
  unsubscribed: boolean
  error: string | null
}

export interface LinkReport { url: string; unique: number; total: number; pctOfSent: number; machine: number }

export interface CampaignReport {
  metrics: {
    total: number; sent: number; pending: number; failed: number
    delivered: number; opened: number; openTotal: number; clicked: number; clickTotal: number
    bounced: number; complained: number; unsubscribed: number
    machineOpens: number; machineClicks: number
    openRate: number; clickRate: number; clickToOpen: number; deliveryRate: number
  }
  timeline: IssueStats['timeline']
  bucket: IssueStats['bucket']
  byHour: IssueStats['byHour']
  byWeekday: { day: number; opened: number; clicked: number }[]
  devices: Breakdown[]
  clients: Breakdown[]
  os: Breakdown[]
  /** כמה מהפותחים יש להם נתוני מכשיר (בקמפיינים ישנים: אין) */
  withDeviceInfo: number
  links: LinkReport[]
  recipients: RecipientReport[]
}

const UNKNOWN = 'לא ידוע'
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Jerusalem' })
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const rate = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0)

export function isMachineEvent(e: ReportEvent): boolean {
  return !!(e.is_machine || (e.raw && (e.raw as Record<string, unknown>).machine))
}

function uaInfo(e: ReportEvent) {
  if (e.device || e.client || e.os) return { device: e.device ?? UNKNOWN, client: e.client ?? UNKNOWN, os: e.os ?? UNKNOWN }
  const raw = (e.raw ?? {}) as Record<string, unknown>
  if (raw.device || raw.client) return { device: String(raw.device ?? UNKNOWN), client: String(raw.client ?? UNKNOWN), os: String(raw.os ?? UNKNOWN) }
  return e.user_agent ? parseUserAgent(e.user_agent) : null
}

function tally(m: Map<string, number>): Breakdown[] {
  return [...m.entries()].map(([label, count]) => ({ label, count }))
    .sort((a, b) => (a.label === UNKNOWN ? 1 : b.label === UNKNOWN ? -1 : b.count - a.count))
}

const nameOf = (r: ReportRecipient) => {
  const d = r.merge_data ?? {}
  const v = d['שם_מלא'] ?? d['full_name'] ?? d['name'] ?? [d['שם_פרטי'] ?? d['first_name'], d['שם_משפחה'] ?? d['last_name']].filter(Boolean).join(' ')
  return String(v ?? '').trim()
}

export function buildCampaignReport(
  recipients: ReportRecipient[],
  events: ReportEvent[],
  unsubscribed: Set<string> = new Set(),
  now: Date = new Date(),
): CampaignReport {
  const byRecipient = new Map<string, ReportEvent[]>()
  for (const e of events) {
    if (!e.recipient_id) continue
    const list = byRecipient.get(e.recipient_id)
    if (list) list.push(e)
    else byRecipient.set(e.recipient_id, [e])
  }

  const linkMap = new Map<string, { recips: Set<string>; total: number; machine: number }>()
  const devices = new Map<string, number>(), clients = new Map<string, number>(), oses = new Map<string, number>()
  const byWeekday = WEEKDAYS.map((_, day) => ({ day, opened: 0, clicked: 0 }))
  let machineOpens = 0, machineClicks = 0, withDeviceInfo = 0

  const rows: RecipientReport[] = recipients.map(r => {
    const evs = (byRecipient.get(r.id) ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at))
    const human = evs.filter(e => !isMachineEvent(e))
    const opens = human.filter(e => e.event_type === 'opened')
    const clicks = human.filter(e => e.event_type === 'clicked')
    machineOpens += evs.filter(e => e.event_type === 'opened' && isMachineEvent(e)).length
    machineClicks += evs.filter(e => e.event_type === 'clicked' && isMachineEvent(e)).length

    for (const e of evs) {
      if (e.event_type !== 'clicked' || !e.link_url) continue
      const l = linkMap.get(e.link_url) ?? { recips: new Set<string>(), total: 0, machine: 0 }
      if (isMachineEvent(e)) l.machine++
      else { l.total++; l.recips.add(r.id) }
      linkMap.set(e.link_url, l)
    }

    // מכשיר: מהאירוע הראשון של אדם שיש בו מידע מזוהה
    let info: { device: string; client: string; os: string } | null = null
    for (const e of human) {
      const i = uaInfo(e)
      if (i && (i.device !== UNKNOWN || i.client !== UNKNOWN || i.os !== UNKNOWN)) { info = i; break }
    }
    if (r.opened_at || r.clicked_at) {
      if (info) withDeviceInfo++
      devices.set(info?.device ?? UNKNOWN, (devices.get(info?.device ?? UNKNOWN) ?? 0) + 1)
      clients.set(info?.client ?? UNKNOWN, (clients.get(info?.client ?? UNKNOWN) ?? 0) + 1)
      oses.set(info?.os ?? UNKNOWN, (oses.get(info?.os ?? UNKNOWN) ?? 0) + 1)
    }
    if (r.opened_at) byWeekday[WEEKDAYS.indexOf(weekdayFmt.format(new Date(r.opened_at)))].opened++
    if (r.clicked_at) byWeekday[WEEKDAYS.indexOf(weekdayFmt.format(new Date(r.clicked_at)))].clicked++

    return {
      id: r.id,
      email: r.email,
      name: nameOf(r),
      status: r.status,
      sentAt: r.sent_at,
      firstOpen: r.opened_at,
      lastOpen: opens.length ? opens[opens.length - 1].created_at : r.opened_at,
      openCount: r.open_count ?? 0,
      firstClick: r.clicked_at,
      clickCount: r.click_count ?? 0,
      links: [...new Set(clicks.map(e => e.link_url).filter((u): u is string => !!u))],
      device: info?.device ?? null,
      client: info?.client ?? null,
      os: info?.os ?? null,
      bounced: !!r.bounced_at,
      complained: !!r.complained_at,
      unsubscribed: unsubscribed.has(r.email.toLowerCase()),
      error: r.error,
    }
  })

  const stats = buildIssueStats(recipients.map(r => ({
    status: (r.status === 'sent' || r.status === 'failed' ? r.status : 'pending') as 'pending' | 'sent' | 'failed',
    sent_at: r.sent_at, delivered_at: r.delivered_at, opened_at: r.opened_at, downloaded_at: null,
    bounced_at: r.bounced_at, complained_at: r.complained_at, clicked_at: r.clicked_at, unsubscribed_at: null,
  })), now)

  const sent = rows.filter(r => r.status === 'sent').length
  const opened = recipients.filter(r => r.opened_at).length
  const clicked = recipients.filter(r => r.clicked_at).length
  const delivered = recipients.filter(r => r.delivered_at).length
  const base = delivered || sent

  return {
    metrics: {
      total: recipients.length,
      sent,
      pending: rows.filter(r => r.status === 'pending').length,
      failed: rows.filter(r => r.status === 'failed').length,
      delivered,
      opened,
      openTotal: recipients.reduce((s, r) => s + (r.open_count ?? 0), 0),
      clicked,
      clickTotal: recipients.reduce((s, r) => s + (r.click_count ?? 0), 0),
      bounced: rows.filter(r => r.bounced).length,
      complained: rows.filter(r => r.complained).length,
      unsubscribed: rows.filter(r => r.unsubscribed).length,
      machineOpens,
      machineClicks,
      openRate: rate(opened, base),
      clickRate: rate(clicked, base),
      clickToOpen: rate(clicked, opened),
      deliveryRate: rate(delivered, sent),
    },
    timeline: stats.timeline,
    bucket: stats.bucket,
    byHour: stats.byHour,
    byWeekday,
    devices: tally(devices),
    clients: tally(clients),
    os: tally(oses),
    withDeviceInfo,
    links: [...linkMap.entries()].map(([url, l]) => ({ url, unique: l.recips.size, total: l.total, machine: l.machine, pctOfSent: rate(l.recips.size, sent) }))
      .sort((a, b) => b.unique - a.unique || b.total - a.total),
    recipients: rows,
  }
}
