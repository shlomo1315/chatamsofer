import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { id, status, notes } = body
  if (!id || !status) return NextResponse.json({ error: 'שדות חסרים' }, { status: 400 })

  const valid = ['pending', 'in_progress', 'approved', 'rejected']
  if (!valid.includes(String(status))) return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 })

  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { error } = await admin
    .from('widow_requests')
    .update({
      status: String(status),
      notes: notes ? String(notes) : undefined,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', String(id))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
