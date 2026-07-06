import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET — list all portals (admin)
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ portals: [] })
  const { data } = await admin.from('recovery_portals').select('home_name, updated_at').order('home_name')
  return NextResponse.json({ portals: data ?? [] })
}

// POST — set/update password for a home (admin)
export async function POST(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const { home_name, password } = await request.json()
  if (!home_name || !password || password.length < 10) {
    return NextResponse.json({ error: 'סיסמה חייבת להיות לפחות 10 תווים' }, { status: 400 })
  }
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // הסיסמה נשמרת כ-hash בלבד — לעולם לא בטקסט גלוי
  const hashed = await bcrypt.hash(String(password), 10)
  const { error } = await admin.from('recovery_portals').upsert({
    home_name,
    password: hashed,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'home_name' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove portal access for a home (admin)
export async function DELETE(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const { home_name } = await request.json()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  await admin.from('recovery_portals').delete().eq('home_name', home_name)
  return NextResponse.json({ ok: true })
}
