import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { loadIssue } from '@/lib/gilyonotSender'
import { buildIssueStats, type DeliveryStatRow } from '@/lib/gilyonotStats'

// פילוח השליחה של גיליון, לגרף שמתעדכן במסך: נשלחו, נמסרו, חזרו, פתחו והורידו.
export const dynamic = 'force-dynamic'

const PAGE = 1000
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_r: Request, { params }: Ctx) {
  const staff = await requirePermission('gilyonot', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })

  const rows: DeliveryStatRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.from('gilyonot_deliveries')
      .select('status, sent_at, delivered_at, opened_at, downloaded_at, bounced_at, complained_at, clicked_at, unsubscribed_at')
      .eq('issue_id', issue.id).order('id').range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: 'טעינת הנתונים נכשלה' }, { status: 500 })
    rows.push(...(data as DeliveryStatRow[]))
    if (data.length < PAGE) break
  }
  return NextResponse.json({ status: issue.status, ...buildIssueStats(rows) }, { headers: { 'Cache-Control': 'no-store' } })
}
