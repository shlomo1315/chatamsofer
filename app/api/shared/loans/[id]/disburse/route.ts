import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken, PORTAL_COOKIE } from '@/lib/loansPortalAuth'
import { createClient } from '@supabase/supabase-js'
import { addMonths, format } from 'date-fns'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(PORTAL_COOKIE)?.value
  if (!verifyPortalToken(token)) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }

  const { id } = await params
  const { disbursed_at, disbursed_by } = await req.json()
  if (!disbursed_at) return NextResponse.json({ error: 'חסר תאריך ביצוע' }, { status: 400 })

  const admin = adminClient()

  // שליפת מספר התשלומים לחישוב תאריך סיום
  const { data: loan, error: fetchErr } = await admin
    .from('loans')
    .select('installments, status')
    .eq('id', id)
    .eq('status', 'approved')
    .single()

  if (fetchErr || !loan) return NextResponse.json({ error: 'הלוואה לא נמצאה' }, { status: 404 })

  const startDate = new Date(disbursed_at)
  const endDate = addMonths(startDate, loan.installments ?? 1)

  const { error } = await admin.from('loans').update({
    status: 'active',
    disbursed_at,
    disbursed_by: disbursed_by || null,
    start_date: format(startDate, 'yyyy-MM-dd'),
    end_date: format(endDate, 'yyyy-MM-dd'),
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
