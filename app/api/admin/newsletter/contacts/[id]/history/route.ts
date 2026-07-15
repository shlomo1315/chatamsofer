import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'

// היסטוריית שליחות לקבוצה — כל הקמפיינים שכוונו לקבוצה הזו.
// הקישור: campaigns.segment->>contactListId שווה למזהה הקבוצה.
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'view')
  if (!ctx) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await db
    .from('campaigns')
    .select('id, name, subject, status, total_count, sent_count, failed_count, scheduled_at, started_at, completed_at, created_at')
    .eq('segment->>contactListId', id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ campaigns: data ?? [] })
}
