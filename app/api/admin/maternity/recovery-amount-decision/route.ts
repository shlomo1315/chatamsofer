import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// אישור/דחייה של סכום ההחלמה שהוזן ע"י בית ההחלמה. action: approve | reject | reset
export async function POST(request: NextRequest) {
  if (!(await requirePermission('maternity', 'edit'))) return forbidden()
  const { aidId, action } = await request.json()
  if (!aidId || !['approve', 'reject', 'reset'].includes(action)) {
    return NextResponse.json({ error: 'פרמטרים חסרים' }, { status: 400 })
  }
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending'
  const { error } = await admin.from('maternity_aids')
    .update({ recovery_amount_status: status, updated_at: new Date().toISOString() })
    .eq('id', aidId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
