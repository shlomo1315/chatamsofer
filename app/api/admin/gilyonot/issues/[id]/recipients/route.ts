import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { loadIssue } from '@/lib/gilyonotSender'

// פירוט לפי נמען: מי קיבל, פתח, הקליק, חזר או הסיר. ?q= חיפוש מייל, ?f= סינון, ?csv=1 הורדה.
export const dynamic = 'force-dynamic'

const PAGE = 1000
const FILTERS = ['opened', 'unopened', 'clicked', 'bounced', 'unsubscribed', 'failed'] as const
type Ctx = { params: Promise<{ id: string }> }

const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const staff = await requirePermission('gilyonot', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })

  const sp = new URL(request.url).searchParams
  const f = sp.get('f') ?? ''
  const q = (sp.get('q') ?? '').trim().toLowerCase().replace(/[%,()]/g, '')
  const csv = sp.get('csv') === '1'
  const page = Math.max(0, Number(sp.get('page')) || 0)
  const size = csv ? 100000 : 50

  let query = db.from('gilyonot_deliveries')
    .select('email, status, sent_at, delivered_at, opened_at, open_count, clicked_at, click_count, bounced_at, unsubscribed_at, error', { count: 'exact' })
    .eq('issue_id', issue.id)
  if (q) query = query.ilike('email', `%${q}%`)
  if (f === 'opened') query = query.not('opened_at', 'is', null)
  else if (f === 'unopened') query = query.eq('status', 'sent').is('opened_at', null)
  else if (f === 'clicked') query = query.not('clicked_at', 'is', null)
  else if (f === 'bounced') query = query.not('bounced_at', 'is', null)
  else if (f === 'unsubscribed') query = query.not('unsubscribed_at', 'is', null)
  else if (f === 'failed') query = query.eq('status', 'failed')
  else if (f && !(FILTERS as readonly string[]).includes(f)) return NextResponse.json({ error: 'סינון לא מוכר' }, { status: 400 })

  const rows: Record<string, unknown>[] = []
  if (csv) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await query.order('email').range(offset, offset + PAGE - 1)
      if (error) return NextResponse.json({ error: 'טעינת הנתונים נכשלה' }, { status: 500 })
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    const head = ['מייל', 'סטטוס', 'נשלח', 'נמסר', 'נפתח', 'פתיחות', 'הקליק', 'קליקים', 'חזר', 'הוסר']
    const lines = rows.map(r => [r.email, r.status, r.sent_at, r.delivered_at, r.opened_at, r.open_count, r.clicked_at, r.click_count, r.bounced_at, r.unsubscribed_at].map(csvCell).join(','))
    return new NextResponse('﻿' + [head.map(csvCell).join(','), ...lines].join('\r\n'), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="recipients.csv"', 'Cache-Control': 'no-store' },
    })
  }

  const { data, count, error } = await query.order('opened_at', { ascending: false, nullsFirst: false }).order('email').range(page * size, page * size + size - 1)
  if (error) return NextResponse.json({ error: 'טעינת הנתונים נכשלה' }, { status: 500 })
  return NextResponse.json({ rows: data ?? [], total: count ?? 0, page, size }, { headers: { 'Cache-Control': 'no-store' } })
}
