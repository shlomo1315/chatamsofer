import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'

// רשימת קמפיינים + יצירת קמפיין חדש.
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requirePermission('newsletter', 'view')
  if (ctx instanceof NextResponse) return ctx

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await db
    .from('campaigns')
    .select('id, name, subject, status, total_count, sent_count, failed_count, scheduled_at, completed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // מדדי מעקב לכל קמפיין — נפתחו / הוקלקו
  const ids = (data ?? []).map(c => c.id)
  const engagement: Record<string, { opened: number; clicked: number }> = {}

  if (ids.length) {
    const { data: recips } = await db
      .from('campaign_recipients')
      .select('campaign_id, opened_at, clicked_at')
      .in('campaign_id', ids)

    for (const r of (recips ?? []) as { campaign_id: string; opened_at: string | null; clicked_at: string | null }[]) {
      engagement[r.campaign_id] ??= { opened: 0, clicked: 0 }
      if (r.opened_at) engagement[r.campaign_id].opened++
      if (r.clicked_at) engagement[r.campaign_id].clicked++
    }
  }

  const campaigns = (data ?? []).map(c => ({
    ...c,
    opened: engagement[c.id]?.opened ?? 0,
    clicked: engagement[c.id]?.clicked ?? 0,
  }))

  return NextResponse.json({ campaigns })
}

export async function POST(request: NextRequest) {
  const ctx = await requirePermission('newsletter', 'add')
  if (ctx instanceof NextResponse) return ctx

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let payload: Record<string, unknown>
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const name = String(payload.name ?? '').trim().slice(0, 120)
  if (!name) return NextResponse.json({ error: 'יש לתת שם לקמפיין' }, { status: 400 })

  const { data, error } = await db.from('campaigns').insert({
    name,
    subject: String(payload.subject ?? name).slice(0, 200),
    from_department: String(payload.from_department ?? 'main'),
    created_by: ctx?.userId ?? null,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
