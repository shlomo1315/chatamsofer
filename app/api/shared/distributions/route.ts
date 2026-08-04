import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken, DIST_PORTAL_COOKIE } from '@/lib/distributionsPortalAuth'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// דף שיתוף חלוקות חגים — API לתצוגה בלבד (view-only).
//
// מחזיר את *כל* החלוקות ואת *כל* הנרשמים בהן, עם אותם שדות שמסך הניהול מציג.
// אין כאן שום כתיבה — הדף המשותף הוא קריאה בלבד. אימות דרך cookie הסיסמה בלבד.
// ─────────────────────────────────────────────────────────────────────────────

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(DIST_PORTAL_COOKIE)?.value
  if (!(await verifyPortalToken(token))) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }

  const admin = adminClient()

  const { data: distributions, error: distErr } = await admin
    .from('distributions')
    .select('id, name, year, holiday, description, status, registration_open, amount_per_family, total_budget, distribution_date, created_at')
    .order('created_at', { ascending: false })
  if (distErr) return NextResponse.json({ error: distErr.message }, { status: 500 })

  const ids = (distributions ?? []).map(d => d.id)
  let recipients: unknown[] = []
  if (ids.length) {
    const { data: recs, error: recErr } = await admin
      .from('distribution_recipients')
      .select('id, distribution_id, source, registered_at, phone, notified_at, amount, beneficiary_id, approval_status, approved_at, card_number, card_linked_at, beneficiary:beneficiaries(id, full_name, family_name, spouse_name, id_number, phone, phone2, email, address, city, community_affiliation, children_count, birth_date, spouse_birth_date)')
      .in('distribution_id', ids)
      .order('registered_at', { ascending: false })
    if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })
    recipients = recs ?? []
  }

  return NextResponse.json(
    { distributions: distributions ?? [], recipients },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
