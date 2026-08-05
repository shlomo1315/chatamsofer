import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken, PORTAL_COOKIE } from '@/lib/loansPortalAuth'
import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetchAllRows'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PORTAL_COOKIE)?.value
  if (!(await verifyPortalToken(token))) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }

  const admin = adminClient()
  // ⚠️ בדפים: תקרת השורות של PostgREST נאכפת בצד השרת ואינה ניתנת לעקיפה
  // ב-limit — הרשימה נקטעה ב-1,000 בשקט. ראו lib/fetchAllRows.
  const { rows, error } = await fetchAllRows<unknown>((from, to) => admin
    .from('loans')
    .select('id, amount, approved_amount, installments, monthly_payment, purpose, purpose_details, status, start_date, notes, disbursed_at, disbursed_by, created_at, beneficiary:beneficiaries(full_name, family_name, id_number, city, address, phone, email)')
    .in('status', ['approved', 'active'])
    .order('created_at', { ascending: false })
    .range(from, to))

  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ loans: rows })
}
