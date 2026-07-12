import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'

// מצב מכתב הברכה והמשוב ללידה מסוימת — לטאב בכרטסת היולדת.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const ctx = await requirePermission('maternity', 'view')
  if (ctx instanceof NextResponse) return ctx

  const aidId = request.nextUrl.searchParams.get('aidId')
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const [letterRes, scheduledRes] = await Promise.all([
    db.from('gratitude_letters')
      .select('id, source, body, signature, is_anonymous, scan_url, status, created_at')
      .eq('maternity_aid_id', aidId)
      .maybeSingle(),
    db.from('scheduled_emails')
      .select('kind, status, send_after, sent_at')
      .eq('entity_table', 'maternity_aids')
      .eq('entity_id', aidId),
  ])

  return NextResponse.json({
    letter: letterRes.data ?? null,
    scheduled: scheduledRes.data ?? [],
  })
}
