import { NextResponse, type NextRequest } from 'next/server'
import { portalCookieName, signPortalToken } from '@/lib/portal-auth'
import { createAdminClient as getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let body: { home?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const { home, password } = body
  if (!home || !password) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }

  // שולפים password_hash אם קיים; אם העמודה עדיין לא קיימת (לפני ה-migration)
  // נופלים ל-select של plaintext בלבד — כך הקוד עמיד לשני הסדרים של פריסה/migration.
  let row: { password?: string | null; password_hash?: string | null } | null = null
  const withHash = await admin
    .from('recovery_portals')
    .select('password, password_hash')
    .eq('home_name', home)
    .single()
  if (withHash.error) {
    const plainOnly = await admin
      .from('recovery_portals')
      .select('password')
      .eq('home_name', home)
      .single()
    if (plainOnly.error || !plainOnly.data) {
      return NextResponse.json({ error: 'בית ההחלמה לא נמצא במערכת' }, { status: 404 })
    }
    row = plainOnly.data
  } else {
    row = withHash.data
  }

  if (!row) {
    return NextResponse.json({ error: 'בית ההחלמה לא נמצא במערכת' }, { status: 404 })
  }

  // אימות דו-כיווני לזמן המעבר:
  //  • אם יש password_hash → מאמתים דרך RPC (bcrypt, constant-time).
  //  • אחרת (לפני הרצת ה-migration) → fallback להשוואת plaintext.
  let ok = false
  if (row.password_hash) {
    const { data: verified } = await admin.rpc('verify_portal_password', {
      p_home: home,
      p_password: password,
    })
    ok = verified === true
  } else if (row.password != null) {
    ok = row.password === password
  }

  if (!ok) {
    return NextResponse.json({ error: 'סיסמה שגויה' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(portalCookieName(home), signPortalToken(home), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: 60 * 60 * 24,
    path: '/',
  })
  return response
}
