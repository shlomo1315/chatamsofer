import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getReportEmail, setReportEmail, runWeeklyLoansReport } from '@/lib/loansReport'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'לא מורשה' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { ok: false as const, status: 403, error: 'נדרשות הרשאות מנהל' }
  return { ok: true as const }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const email = await getReportEmail()
  return NextResponse.json({ email })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { email, send } = await req.json()

  // שליחת בדיקה מיידית של הדוח לכתובת שמורה
  if (send) {
    const res = await runWeeklyLoansReport()
    if (!res.sent) return NextResponse.json({ error: res.error ?? 'שליחה נכשלה' }, { status: 400 })
    return NextResponse.json({ ok: true, sentTo: res.to })
  }

  const value = String(email ?? '').trim()
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  }
  await setReportEmail(value)
  return NextResponse.json({ ok: true })
}
