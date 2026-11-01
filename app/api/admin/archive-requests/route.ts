import { NextResponse } from 'next/server'
import { getServiceClient, requireAdmin, forbidden } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// אישור או דחייה של בקשת תיקון. מנהל בלבד.
export async function POST(request: Request) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const b = await request.json().catch(() => null) as { id?: unknown; action?: unknown } | null
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!b || typeof b.id !== 'string' || !uuid.test(b.id) || (b.action !== 'approve' && b.action !== 'reject')) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const { data, error } = await db.from('archive_requests')
    .update({ status: b.action === 'approve' ? 'approved' : 'rejected', decided_at: new Date().toISOString(), decided_by: staff.userId })
    .eq('id', b.id).eq('status', 'pending').select('id')
  if (error) return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'הבקשה כבר טופלה' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
