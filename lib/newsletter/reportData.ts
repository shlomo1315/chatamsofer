import type { SupabaseClient } from '@supabase/supabase-js'
import { buildCampaignReport, type CampaignReport, type ReportEvent, type ReportRecipient } from './report'

// טעינת כל הנתונים של קמפיין לדוח: כל הנמענים (בעמודים, בלי תקרה),
// האירועים של הנמענים האלה בלבד, וההסרות שנעשו מהקמפיין.

const PAGE = 1000
const ID_CHUNK = 150 // רשימת מזהים ב-in() נכנסת לכתובת הבקשה, לכן במנות

async function all<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) return out
  }
}

export interface CampaignHead {
  id: string; name: string; subject: string | null; status: string
  total_count: number | null; started_at: string | null; completed_at: string | null
}

export async function loadCampaignReport(db: SupabaseClient, id: string, now = new Date()): Promise<{ campaign: CampaignHead; report: CampaignReport } | null> {
  const { data: campaign } = await db.from('campaigns')
    .select('id, name, subject, status, total_count, started_at, completed_at').eq('id', id).maybeSingle()
  if (!campaign) return null

  const recipients = await all<ReportRecipient>((from, to) => db.from('campaign_recipients')
    .select('id, email, status, sent_at, delivered_at, opened_at, open_count, clicked_at, click_count, bounced_at, complained_at, error, merge_data')
    .eq('campaign_id', id).order('id').range(from, to))

  const ids = recipients.filter(r => r.opened_at || r.clicked_at || r.status === 'sent').map(r => r.id)
  const events: ReportEvent[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK * 4) {
    const groups = [0, 1, 2, 3].map(k => ids.slice(i + k * ID_CHUNK, i + (k + 1) * ID_CHUNK)).filter(g => g.length)
    const parts = await Promise.all(groups.map(g => all<ReportEvent>((from, to) => db.from('email_events')
      .select('*').in('recipient_id', g).in('event_type', ['opened', 'clicked']).order('created_at').range(from, to))))
    for (const p of parts) events.push(...p)
  }

  const unsubs = await all<{ email: string }>((from, to) => db.from('unsubscribes')
    .select('email').eq('campaign_id', id).range(from, to))

  return {
    campaign: campaign as CampaignHead,
    report: buildCampaignReport(recipients, events, new Set(unsubs.map(u => u.email.toLowerCase())), now),
  }
}
