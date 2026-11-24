import { NextResponse } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'

// השוואה בין הקמפיינים האחרונים שנשלחו: נשלחו, פתיחות, קליקים, חזרות והסרות.
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requirePermission('newsletter', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: list } = await db.from('campaigns')
    .select('id, name, started_at, completed_at, status')
    .in('status', ['sent', 'sending', 'paused'])
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(12)

  const count = async (id: string, col?: string) => {
    let q = db.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', id).eq('status', 'sent')
    if (col) q = q.not(col, 'is', null)
    return (await q).count ?? 0
  }
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0)

  const campaigns = await Promise.all((list ?? []).map(async c => {
    const [sent, opened, clicked, bounced, unsub] = await Promise.all([
      count(c.id), count(c.id, 'opened_at'), count(c.id, 'clicked_at'), count(c.id, 'bounced_at'),
      db.from('unsubscribes').select('email', { count: 'exact', head: true }).eq('campaign_id', c.id).then(r => r.count ?? 0),
    ])
    return {
      id: c.id, name: c.name, at: c.started_at, sent, opened, clicked, bounced, unsubscribed: unsub,
      openRate: pct(opened, sent), clickRate: pct(clicked, sent), clickToOpen: pct(clicked, opened),
    }
  }))
  return NextResponse.json({ campaigns })
}
