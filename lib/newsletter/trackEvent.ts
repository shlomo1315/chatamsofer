import type { SupabaseClient } from '@supabase/supabase-js'
import { machineReason, parseUserAgent } from './tracking'

// רישום פתיחה או קליק של נמען בקמפיין. משמש גם את הפיקסל והקישורים שלנו
// וגם את ה-webhook של Resend (קמפיינים ישנים). קודם דרך ה-RPC האטומי
// newsletter_track; אם הוא עוד לא קיים במסד, רישום חלופי עם העמודות הישנות.

export interface TrackInput {
  recipientId: string
  kind: 'open' | 'click'
  link?: string | null
  ua?: string | null
  method?: string
  source: 'own' | 'resend'
  raw?: Record<string, unknown> | null
}

export interface TrackedRecipient {
  id: string
  resend_id: string | null
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  open_count: number | null
  click_count: number | null
}

export async function recordNewsletterEvent(db: SupabaseClient, input: TrackInput, now: Date = new Date()): Promise<{ machine: string | null } | null> {
  const { data } = await db.from('campaign_recipients')
    .select('id, resend_id, sent_at, opened_at, clicked_at, open_count, click_count')
    .eq('id', input.recipientId).maybeSingle()
  const r = data as TrackedRecipient | null
  if (!r) return null

  const sentAt = r.sent_at ? Date.parse(r.sent_at) : NaN
  const secondsSinceSent = Number.isNaN(sentAt) ? null : (now.getTime() - sentAt) / 1000
  const machine = machineReason({ ua: input.ua, method: input.method, kind: input.kind, secondsSinceSent })
  const info = parseUserAgent(input.ua)

  const { error } = await db.rpc('newsletter_track', {
    p_recipient: r.id, p_kind: input.kind, p_link: input.link ?? null, p_ua: input.ua ?? '',
    p_device: info.device, p_client: info.client, p_os: info.os,
    p_machine: !!machine, p_reason: machine, p_source: input.source, p_raw: input.raw ?? null,
  })
  if (!error) return { machine }

  // גיבוי: המיגרציה עוד לא הוחלה. אותו היגיון, בלי אטומיות של המונים.
  console.error('[newsletter] newsletter_track נכשל, רישום חלופי:', error.message)
  await db.from('email_events').insert({
    resend_id: r.resend_id ?? 'own',
    recipient_id: r.id,
    event_type: input.kind === 'click' ? 'clicked' : 'opened',
    link_url: input.link ?? null,
    user_agent: input.ua || null,
    raw: { ...(input.raw ?? {}), source: input.source, machine, ...info },
  })
  if (machine) return { machine }
  const iso = now.toISOString()
  const patch: Record<string, unknown> = { opened_at: r.opened_at ?? iso }
  if (input.kind === 'click') {
    patch.clicked_at = r.clicked_at ?? iso
    patch.click_count = (r.click_count ?? 0) + 1
    patch.open_count = Math.max(r.open_count ?? 0, 1)
  } else {
    patch.open_count = (r.open_count ?? 0) + 1
  }
  await db.from('campaign_recipients').update(patch).eq('id', r.id)
  return { machine }
}
