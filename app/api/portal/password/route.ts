import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient as getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return data?.role === 'admin'
}

// GET — list all portals (admin)
export async function GET() {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ portals: [] })
  const { data } = await admin.from('recovery_portals').select('home_name, updated_at').order('home_name')
  return NextResponse.json({ portals: data ?? [] })
}

// POST — set/update password for a home (admin)
export async function POST(request: NextRequest) {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const { home_name, password } = await request.json()
  if (!home_name || !password || password.length < 10) {
    return NextResponse.json({ error: 'סיסמה חייבת להיות לפחות 10 תווים' }, { status: 400 })
  }
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // מגבבים את הסיסמה בצד ה-DB עם bcrypt (pgcrypto) ושומרים ב-password_hash.
  // עמודת password ה-plaintext נשמרת ריקה — שלב 4 ב-migration ימחק אותה בהמשך.
  const { data: hashed, error: hashErr } = await admin.rpc('hash_portal_password', { p_password: password })
  if (hashErr || !hashed) {
    return NextResponse.json({ error: 'שגיאה בהצפנת הסיסמה' }, { status: 500 })
  }

  const { error } = await admin.from('recovery_portals').upsert({
    home_name,
    password_hash: hashed,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'home_name' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove portal access for a home (admin)
export async function DELETE(request: NextRequest) {
  if (!await verifyAdmin()) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const { home_name } = await request.json()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  await admin.from('recovery_portals').delete().eq('home_name', home_name)
  return NextResponse.json({ ok: true })
}
