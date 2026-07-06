import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { portalCookieName } from '../login/route'
import { addDays } from 'date-fns'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const home = request.nextUrl.searchParams.get('home')
  if (!home) return NextResponse.json({ error: 'חסר שם בית החלמה' }, { status: 400 })

  // Verify portal cookie
  const cookieStore = await cookies()
  const isAuthed = cookieStore.get(portalCookieName(home))?.value === '1'
  if (!isAuthed) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await admin
    .from('maternity_aids')
    .select(`
      id, birth_date, baby_name, baby_gender, six_weeks_end,
      is_twins, babies, recovery_eligibility_days,
      recovery_from, recovery_to, card_number, notes, recovery_arrived,
      recovery_amount, recovery_amount_status, recovery_nights, recovery_receipt_number,
      beneficiary:beneficiaries(
        id, full_name, family_name, spouse_name, spouse_id_number, phone, address, city
      )
    `)
    .eq('status', 'active')
    .eq('recovery_home', home)
    .order('birth_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // מציגים יולדות שחלון 6 השבועות שלהן עדיין פעיל — כולל יום הסיום עצמו
  const today0 = new Date(); today0.setHours(0, 0, 0, 0)
  const filtered = (data ?? []).filter((a: { birth_date: string; six_weeks_end?: string }) => {
    const end = a.six_weeks_end ? new Date(a.six_weeks_end) : addDays(new Date(a.birth_date), 42)
    end.setHours(0, 0, 0, 0)
    return end >= today0
  })

  return NextResponse.json({ aids: filtered })
}
