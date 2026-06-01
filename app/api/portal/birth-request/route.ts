import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const { beneficiary_id, birth_date, baby_name, baby_gender, recovery_home, notes } = body

  if (!beneficiary_id || !birth_date) {
    return NextResponse.json({ error: 'שדות חובה חסרים' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, eligibility_status')
    .eq('id', String(beneficiary_id))
    .maybeSingle()

  if (!ben) return NextResponse.json({ error: 'נרשם לא נמצא' }, { status: 404 })
  if (ben.eligibility_status === 'rejected') {
    return NextResponse.json({ error: 'הגשת בקשה אינה זמינה עבור חשבון זה' }, { status: 403 })
  }

  const { error } = await admin.from('maternity_aids').insert({
    beneficiary_id: String(beneficiary_id),
    birth_date: String(birth_date),
    baby_name: baby_name ? String(baby_name).trim() : null,
    baby_gender: baby_gender || null,
    recovery_home: recovery_home ? String(recovery_home).trim() : null,
    notes: notes ? String(notes).trim() : null,
    status: 'pending',
  })

  if (error) {
    return NextResponse.json({ error: 'שגיאה בשמירת הבקשה. אנא נסה שוב.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
