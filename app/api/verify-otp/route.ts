import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createHmac } from 'crypto'
import { rateLimit, clientIp } from '@/lib/rateLimit'

function signNonce(email: string): string {
  const secret = process.env.OTP_NONCE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const exp = Date.now() + 15 * 60 * 1000 // 15 minutes
  const payload = `${email}:${exp}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export async function POST(request: NextRequest) {
  // הגבלת קצב — בולמת ניחוש קוד OTP (לפי IP)
  if (!rateLimit(`verify-otp:${clientIp(request)}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד מספר דקות.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const { email, token } = body as { email?: string; token?: string }

  if (!email || !token || !/^\d{6}$/.test(token)) {
    return NextResponse.json({ error: 'נתונים חסרים' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error || !data.user) {
    return NextResponse.json({ error: 'הקוד שגוי או פג תוקף. אנא נסה שוב.' }, { status: 400 })
  }

  // Sign out immediately — we don't keep a Supabase session for public users
  await supabase.auth.signOut()

  // Check if already registered by email
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: existing } = await adminClient
    .from('beneficiaries')
    .select('id, full_name, eligibility_status, created_at')
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadyRegistered: true,
      beneficiary: {
        full_name: existing.full_name,
        eligibility_status: existing.eligibility_status,
        created_at: existing.created_at,
      },
    })
  }

  // Issue a short-lived nonce proving email ownership
  const nonce = signNonce(email)

  return NextResponse.json({ ok: true, alreadyRegistered: false, nonce })
}
