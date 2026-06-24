import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { id, status, notes } = body
  if (!id || !status) return NextResponse.json({ error: 'שדות חסרים' }, { status: 400 })

  const valid = ['pending', 'in_progress', 'approved', 'rejected']
  if (!valid.includes(String(status))) return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 })

  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: prev } = await admin.from('widow_requests').select('status').eq('id', String(id)).maybeSingle()

  const { error } = await admin
    .from('widow_requests')
    .update({
      status: String(status),
      notes: notes ? String(notes) : undefined,
      reviewed_at: new Date().toISOString(),
      reviewed_by: staff.userId,
    })
    .eq('id', String(id))

  if (error) {
    console.error('[widow-request-status] update failed:', error.message)
    return NextResponse.json({ error: 'שגיאה בעדכון הבקשה' }, { status: 500 })
  }

  await logActivity(admin, {
    userId: staff.userId,
    action: 'widow_request_status_changed',
    entityType: 'widow_request',
    entityId: String(id),
    details: { from: (prev as { status?: string } | null)?.status ?? null, to: String(status) },
  })

  return NextResponse.json({ ok: true })
}
