import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient as getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.replace(/\D/g, '')
  if (!id || id.length < 5) {
    return NextResponse.json({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await admin
    .from('beneficiaries')
    .select('id, full_name, family_name, eligibility_status, is_active, phone, city, marital_status, created_at')
    .eq('id_number', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ found: false })

  return NextResponse.json({ found: true, beneficiary: data })
}
