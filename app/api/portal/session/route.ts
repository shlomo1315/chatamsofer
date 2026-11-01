import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { BENEFICIARY_SELECT, loadDashboardDocs } from '@/lib/portalBeneficiary'

export const dynamic = 'force-dynamic'

// שחזור המנוי מסשן קיים (אחרי כניסה מקישור חתום במייל) — בלי להזין ת"ז וקוד שוב.
export async function GET(request: NextRequest) {
  const id = getPortalBeneficiaryId(request)
  if (!id) return NextResponse.json({ ok: false }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data } = await admin.from('beneficiaries').select(BENEFICIARY_SELECT).eq('id', id).maybeSingle()
  if (!data) return NextResponse.json({ ok: false }, { status: 401 })
  const documents = await loadDashboardDocs(admin, id)
  return NextResponse.json({ ok: true, beneficiary: data, documents }, { headers: { 'Cache-Control': 'no-store' } })
}
