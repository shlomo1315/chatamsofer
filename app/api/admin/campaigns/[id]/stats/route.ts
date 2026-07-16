import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'

// סטטיסטיקות קמפיין — מדדים, נמענים, וקליקים לפי קישור.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: campaign } = await db
    .from('campaigns')
    .select('id, name, status, total_count, sent_count, failed_count, started_at, completed_at')
    .eq('id', id)
    .maybeSingle()

  if (!campaign) return NextResponse.json({ error: 'הקמפיין לא נמצא' }, { status: 404 })

  const { data: recips } = await db
    .from('campaign_recipients')
    .select('id, email, status, delivered_at, opened_at, open_count, clicked_at, click_count, bounced_at, complained_at, error, merge_data')
    .eq('campaign_id', id)
    .limit(2000)

  const rows = (recips ?? []) as Record<string, unknown>[]

  const metrics = {
    total: campaign.total_count,
    sent: rows.filter(r => r.status === 'sent').length,
    pending: rows.filter(r => r.status === 'pending').length,
    failed: rows.filter(r => r.status === 'failed').length,
    delivered: rows.filter(r => r.delivered_at).length,
    opened: rows.filter(r => r.opened_at).length,
    clicked: rows.filter(r => r.clicked_at).length,
    bounced: rows.filter(r => r.bounced_at).length,
    complained: rows.filter(r => r.complained_at).length,
  }

  // קליקים לפי קישור — איזה קישור נלחץ הכי הרבה
  const { data: clicks } = await db
    .from('email_events')
    .select('link_url, recipient_id')
    .eq('event_type', 'clicked')
    .not('link_url', 'is', null)

  const recipIds = new Set(rows.map(r => String(r.id)))
  const byLink: Record<string, number> = {}
  for (const c of (clicks ?? []) as { link_url: string; recipient_id: string | null }[]) {
    if (c.recipient_id && !recipIds.has(c.recipient_id)) continue
    byLink[c.link_url] = (byLink[c.link_url] ?? 0) + 1
  }

  const links = Object.entries(byLink)
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  // תגובות שהתקבלו לקמפיין (נמענים שהשיבו למייל)
  const { data: replies } = await db
    .from('inbound_emails')
    .select('id, from_email, from_name, subject, plain_text, received_at')
    .eq('campaign_id', id)
    .order('received_at', { ascending: false })
    .limit(100)

  return NextResponse.json({
    campaign,
    metrics,
    links,
    replies: (replies ?? []).map(r => ({
      id: r.id,
      from: r.from_name || r.from_email,
      email: r.from_email,
      subject: r.subject,
      text: String(r.plain_text ?? '').slice(0, 300),
      at: r.received_at,
    })),
    recipients: rows.map(r => ({
      email: r.email,
      name: (r.merge_data as Record<string, string>)?.['שם_מלא'] ?? '',
      status: r.status,
      opened: Boolean(r.opened_at),
      openCount: r.open_count ?? 0,
      clicked: Boolean(r.clicked_at),
      clickCount: r.click_count ?? 0,
      bounced: Boolean(r.bounced_at),
      error: r.error ?? null,
    })),
  })
}
