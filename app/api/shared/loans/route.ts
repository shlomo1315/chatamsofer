import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken, PORTAL_COOKIE } from '@/lib/loansPortalAuth'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PORTAL_COOKIE)?.value
  if (!verifyPortalToken(token)) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }

  const admin = adminClient()
  const { data, error } = await admin
    .from('loans')
    .select('id, amount, approved_amount, installments, monthly_payment, purpose, purpose_details, status, start_date, notes, disbursed_at, disbursed_by, created_at, beneficiary:beneficiaries(full_name, family_name, id_number, city, phone)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ loans: data ?? [] })
}
