import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { rateLimit, clientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

export function portalCookieName(home: string): string {
  const safe = Buffer.from(home, 'utf-8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .slice(0, 32)
  return `ph_${safe}`
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  // הגבלת קצב — בולמת ניחוש סיסמאות
  if (!rateLimit(`portal-login:${clientIp(request)}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד מספר דקות.' }, { status: 429 })
  }

  const { home, password } = await request.json()
  if (!home || !password) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }

  const { data, error } = await admin
    .from('recovery_portals')
    .select('password')
    .eq('home_name', home)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'בית ההחלמה לא נמצא במערכת' }, { status: 404 })
  }

  // סיסמאות נשמרות כ-hash (bcrypt). סיסמה ישנה בטקסט גלוי — מאומתת פעם אחת ומשודרגת ל-hash.
  const stored: string = data.password ?? ''
  if (stored.startsWith('$2')) {
    const ok = await bcrypt.compare(password, stored)
    if (!ok) return NextResponse.json({ error: 'סיסמה שגויה' }, { status: 401 })
  } else {
    if (stored !== password) {
      return NextResponse.json({ error: 'סיסמה שגויה' }, { status: 401 })
    }
    // שדרוג שקוף ל-hash — כשל בשדרוג אינו חוסם את ההתחברות
    try {
      const hash = await bcrypt.hash(password, 10)
      await admin.from('recovery_portals').update({ password: hash }).eq('home_name', home)
    } catch (e) {
      console.error('[portal-login] password hash upgrade failed:', e)
    }
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(portalCookieName(home), '1', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })
  return response
}
