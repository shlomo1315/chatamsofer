import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, unauthorized } from '@/lib/apiAuth'
import { getRegistrationGate } from '@/lib/registrationGate'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET — סטטוס שער ההרשמה + הקוד העוקף (למנהל בלבד)
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return unauthorized()
  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const gate = await getRegistrationGate(sb)
  return NextResponse.json(gate, { headers: { 'Cache-Control': 'no-store' } })
}

// POST — עדכון פתיחה/סגירה ({ open: boolean }) או יצירת קוד עוקף חדש ({ regenerate: true })
export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return unauthorized()
  const sb = getAdminClient()
  if (!sb) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { open?: boolean; regenerate?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  if (typeof body.open === 'boolean') {
    await sb.from('app_settings').upsert(
      { key: 'public_registration_open', value: body.open ? 'true' : 'false', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  }
  if (body.regenerate) {
    const code = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)
    await sb.from('app_settings').upsert(
      { key: 'registration_bypass_code', value: code, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  }

  const gate = await getRegistrationGate(sb)
  return NextResponse.json(gate)
}
