import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { loadIssue } from '@/lib/gilyonotSender'
import { buildLiveView } from '@/lib/gilyonotLive'

// מצב שליחה חיה של גיליון, למסך שמתעדכן כל כמה שניות: מונים, זמני שליחה לפי דקה,
// עצירות ועשרת המיילים האחרונים. מונים בספירה (head) ולא בטעינת כל השורות.
export const dynamic = 'force-dynamic'

const PAGE = 1000
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_r: Request, { params }: Ctx) {
  const staff = await requirePermission('gilyonot', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id) as (Awaited<ReturnType<typeof loadIssue>> & { started_at?: string | null; completed_at?: string | null; title: string }) | null
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })

  const base = () => db.from('gilyonot_deliveries').select('id', { count: 'exact', head: true }).eq('issue_id', issue.id)
  const counts = await Promise.all([
    base(),
    base().eq('status', 'sent'),
    base().eq('status', 'pending'),
    base().eq('status', 'failed'),
    base().not('delivered_at', 'is', null),
    base().not('opened_at', 'is', null),
    base().not('clicked_at', 'is', null),
    base().not('downloaded_at', 'is', null),
  ])
  if (counts.some(c => c.error)) return NextResponse.json({ error: 'טעינת הנתונים נכשלה' }, { status: 500 })
  const [total, sent, pending, failed, delivered, opened, clicked, downloaded] = counts.map(c => c.count ?? 0)

  const pages = await Promise.all(Array.from({ length: Math.ceil(sent / PAGE) }, (_, p) =>
    db.from('gilyonot_deliveries').select('sent_at').eq('issue_id', issue.id).not('sent_at', 'is', null)
      .order('sent_at').range(p * PAGE, p * PAGE + PAGE - 1)))
  if (pages.some(p => p.error)) return NextResponse.json({ error: 'טעינת הנתונים נכשלה' }, { status: 500 })
  const times = pages.flatMap(p => (p.data ?? []).map((r: { sent_at: string }) => Date.parse(r.sent_at)))

  const { data: recent } = await db.from('gilyonot_deliveries').select('email, sent_at')
    .eq('issue_id', issue.id).not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(10)

  return NextResponse.json({
    issue: { id: issue.id, title: issue.title, parasha: issue.parasha, status: issue.status, started_at: issue.started_at ?? null, completed_at: issue.completed_at ?? null },
    total, sent, pending, failed, delivered, opened, clicked, downloaded,
    recent: recent ?? [],
    ...buildLiveView(times, pending, { status: issue.status, completedAt: issue.completed_at }),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
