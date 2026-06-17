import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { setPortalPassword } from '@/lib/loansPortalAuth'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'נדרשות הרשאות מנהל' }, { status: 403 })

  const { password } = await req.json()
  if (!password || String(password).length < 8) {
    return NextResponse.json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' }, { status: 400 })
  }

  await setPortalPassword(String(password))
  return NextResponse.json({ ok: true })
}
