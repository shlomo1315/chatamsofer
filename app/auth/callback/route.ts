import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createHmac } from 'crypto'

function signNonce(email: string): string {
  const secret = process.env.OTP_NONCE_SECRET || 'change-this-secret-in-production'
  const exp = Date.now() + 15 * 60 * 1000
  const payload = `${email}:${exp}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/admin/dashboard'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=auth', requestUrl.origin))
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL('/login?error=auth', requestUrl.origin))
  }

  // Public registration flow — generate nonce and redirect to form
  if (next === 'register') {
    const userEmail = data.session?.user?.email

    if (userEmail) {
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const { data: existing } = await adminClient
        .from('beneficiaries')
        .select('id, full_name, eligibility_status, created_at')
        .eq('email', userEmail.toLowerCase())
        .maybeSingle()

      // Sign out — public users don't keep a session
      await supabase.auth.signOut()

      if (existing) {
        const params = new URLSearchParams({
          verified: 'true',
          already: 'true',
          email: userEmail,
          name: existing.full_name,
          status: existing.eligibility_status,
          reg_date: existing.created_at,
        })
        return NextResponse.redirect(new URL(`/?${params}`, requestUrl.origin))
      }

      const nonce = signNonce(userEmail)
      const params = new URLSearchParams({
        verified: 'true',
        email: userEmail,
        nonce,
      })
      return NextResponse.redirect(new URL(`/?${params}`, requestUrl.origin))
    }

    return NextResponse.redirect(new URL('/', requestUrl.origin))
  }

  // Admin / staff flow — ודא שקיים פרופיל צוות פעיל (לפי id או אימייל, לתמיכה ב-Google)
  const user = data.session?.user
  if (user) {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    let prof: { is_active?: boolean | null; role?: string | null } | null = null
    const byId = await adminClient.from('profiles').select('is_active, role').eq('id', user.id).maybeSingle()
    prof = byId.data
    if (!prof && user.email) {
      const byEmail = await adminClient.from('profiles').select('is_active, role').ilike('email', user.email).maybeSingle()
      prof = byEmail.data
    }
    const STAFF = ['admin', 'secretary', 'reviewer', 'collections']
    if (!prof || prof.is_active === false || !STAFF.includes(String(prof.role))) {
      // משתמש Google שאינו מורשה — ניתוק והודעה
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login?error=unauthorized', requestUrl.origin))
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
