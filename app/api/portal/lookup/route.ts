import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const idParam = params.get('id')?.replace(/\D/g, '')
  const passportParam = params.get('passport')?.trim()

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const select = 'id, full_name, family_name, eligibility_status, is_active, phone, city, marital_status, created_at'

  if (idParam) {
    if (idParam.length < 5) return NextResponse.json({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 })
    const { data, error } = await admin.from('beneficiaries').select(select).eq('id_number', idParam).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ found: false })
    return NextResponse.json({ found: true, beneficiary: data })
  }

  if (passportParam) {
    if (passportParam.length < 5) return NextResponse.json({ error: 'מספר דרכון לא תקין' }, { status: 400 })
    const { data, error } = await admin.from('beneficiaries').select(select).ilike('passport_number', passportParam).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ found: false })
    return NextResponse.json({ found: true, beneficiary: data })
  }

  return NextResponse.json({ error: 'נא לספק מספר תעודת זהות או דרכון' }, { status: 400 })
}
