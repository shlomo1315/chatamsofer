import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { signNonce } from '@/lib/otp-nonce'

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

  // Admin / staff flow
  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
