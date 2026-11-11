import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { loadIssue } from '@/lib/gilyonotSender'

// הקלקות לפי קישור, לגיליון אחד. מקור: אירועי Resend (email_events), ראו gilyonot_link_clicks.
export const dynamic = 'force-dynamic'

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('gilyonot', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })
  const { data, error } = await db.rpc('gilyonot_link_clicks', { p_issue: issue.id })
  if (error) return NextResponse.json({ error: 'טעינת הקליקים לפי קישור נכשלה' }, { status: 500 })
  const links = (data ?? []).map((r: { link: string; clicks: number | string; unique_clickers: number | string }) => ({
    link: r.link, clicks: Number(r.clicks), unique: Number(r.unique_clickers),
  }))
  return NextResponse.json({ links }, { headers: { 'Cache-Control': 'no-store' } })
}
