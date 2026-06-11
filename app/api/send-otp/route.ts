import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const { email } = body as { email?: string }

  if (!email || !emailRegex.test(email)) {
    return NextResponse.json({ error: 'כתובת אימייל לא תקינה' }, { status: 400 })
  }

  // הגבלת קצב — מניעת הצפת מיילים (לפי IP ולפי כתובת היעד)
  if (!rateLimit(`otp-ip:${clientIp(request)}`, 8, 10 * 60 * 1000) ||
      !rateLimit(`otp-email:${email.toLowerCase()}`, 3, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'נשלחו יותר מדי קודים. נסה שוב בעוד מספר דקות.' }, { status: 429 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const origin = new URL(request.url).origin
  const emailRedirectTo = `${origin}/auth/callback?next=register`

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo,
    },
  })

  if (error) {
    console.error('OTP send error:', error.message)
    return NextResponse.json({ error: 'שגיאה בשליחת הקוד. אנא נסה שוב.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
