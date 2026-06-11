import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// נקודת אבחון פנימית — לאנשי צוות בלבד (חושפת פרטי שגיאה של מסד הנתונים)
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ ok: false, error: 'env vars missing' }, { status: 500 })

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await admin.from('lineage_nodes').select('id').limit(1)

  if (error) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      hint: 'run supabase/migrations/20240601_lineage_nodes.sql in your Supabase dashboard',
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
