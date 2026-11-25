import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { loadIssue, RATE_PER_SEC } from '@/lib/gilyonotSender'
import { buildEngagement, buildLiveView, type EngagementRow } from '@/lib/gilyonotLive'

// מצב שליחה חיה של גיליון, למסך שמתעדכן כל כמה שניות: מונים, זמני שליחה לפי דקה,
// עצירות, עשרת המיילים האחרונים, פעילות לפי שעה ומי שפתח/הקליק/הוריד.
// מונים בספירה (head) ולא בטעינת כל השורות; המעורבים נטענים בדפים (רק מי שפתח).
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

  // קליק והורדה מסמנים גם פתיחה (gilyonot_track), ולכן מי שפתח הוא כל מי שעשה משהו
  const engagedPages = await Promise.all(Array.from({ length: Math.ceil(opened / PAGE) }, (_, p) =>
    db.from('gilyonot_deliveries')
      .select('email, opened_at, clicked_at, downloaded_at, open_count, click_count, download_count')
      .eq('issue_id', issue.id).not('opened_at', 'is', null)
      .order('opened_at').range(p * PAGE, p * PAGE + PAGE - 1)))
  if (engagedPages.some(p => p.error)) return NextResponse.json({ error: 'טעינת הנתונים נכשלה' }, { status: 500 })

  return NextResponse.json({
    issue: { id: issue.id, title: issue.title, parasha: issue.parasha, status: issue.status, started_at: issue.started_at ?? null, completed_at: issue.completed_at ?? null },
    total, sent, pending, failed, delivered, opened, clicked, downloaded,
    recent: recent ?? [],
    ceiling: RATE_PER_SEC,
    ...buildLiveView(times, pending, { status: issue.status, completedAt: issue.completed_at }),
    ...buildEngagement(engagedPages.flatMap(p => (p.data ?? []) as EngagementRow[])),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
