import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { setPortalSession } from '@/lib/portalSession'
import { verifyPassword } from '@/lib/portalPassword'
import { BENEFICIARY_SELECT, loadDashboardDocs, normalizeId } from '@/lib/portalBeneficiary'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// כניסה לאזור האישי: ת"ז/דרכון + סיסמה. רק לאחר אימות מחזירים את פרטי המוטב
// ופותחים סשן פורטל.
export async function POST(request: NextRequest) {
  if (!rateLimit(`portal-login:${clientIp(request)}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד מספר דקות.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const idNumber = normalizeId(body.idType, body.id)
  const password = String(body.password ?? '')
  if (!idNumber || idNumber.length < 5 || !password) {
    return NextResponse.json({ error: 'נא להזין תעודת זהות וסיסמה' }, { status: 400 })
  }
  // הגבלת קצב נוספת לפי מזהה — בולמת ניחוש סיסמה ממוקד
  if (!rateLimit(`portal-login-id:${idNumber}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד מספר דקות.' }, { status: 429 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data } = await admin
    .from('beneficiaries')
    .select(`${BENEFICIARY_SELECT}, portal_password_hash`)
    .eq('id_number', idNumber)
    .maybeSingle()

  const ok = data && (await verifyPassword(password, data.portal_password_hash))
  if (!ok || !data) {
    return NextResponse.json({ error: 'תעודת זהות או סיסמה שגויים' }, { status: 401 })
  }

  const { portal_password_hash: _omit, ...beneficiary } = data
  void _omit
  const documents = await loadDashboardDocs(admin, data.id)
  const response = NextResponse.json({ ok: true, beneficiary, documents })
  setPortalSession(response, data.id)
  return response
}
