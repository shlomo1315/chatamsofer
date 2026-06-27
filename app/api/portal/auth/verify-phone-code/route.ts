import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { setPortalSession } from '@/lib/portalSession'
import { verifyCode } from '@/lib/portalPassword'
import { BENEFICIARY_SELECT, loadDashboardDocs, normalizeId } from '@/lib/portalBeneficiary'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// אימות הקוד החד-פעמי שהוקרא בשיחה → כניסה אוטומטית (סשן פורטל), כמו כניסה בסיסמה.
export async function POST(request: NextRequest) {
  if (!rateLimit(`portal-verifyphone:${clientIp(request)}`, 15, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד מספר דקות.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const idNumber = normalizeId(body.idType, body.id)
  const code = String(body.code ?? '').replace(/\D/g, '')
  if (!idNumber || idNumber.length < 5 || !code) {
    return NextResponse.json({ error: 'נא להזין את הקוד שהוקרא בשיחה' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data } = await admin
    .from('beneficiaries')
    .select(`${BENEFICIARY_SELECT}, portal_phone_code_hash, portal_phone_code_expires, portal_phone_code_attempts`)
    .eq('id_number', idNumber)
    .maybeSingle()

  const invalid = () => NextResponse.json({ error: 'הקוד שגוי או שפג תוקפו. בקש קוד חדש.' }, { status: 400 })

  if (!data || !data.portal_phone_code_hash || !data.portal_phone_code_expires) return invalid()
  if (new Date(data.portal_phone_code_expires).getTime() < Date.now()) return invalid()
  if ((data.portal_phone_code_attempts ?? 0) >= 5) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות שגויים. בקש קוד חדש.' }, { status: 400 })
  }

  const codeOk = await verifyCode(code, data.portal_phone_code_hash)
  if (!codeOk) {
    await admin
      .from('beneficiaries')
      .update({ portal_phone_code_attempts: (data.portal_phone_code_attempts ?? 0) + 1 })
      .eq('id', data.id)
    return invalid()
  }

  // הצלחה — ניקוי הקוד (hash + plain) והנפקת סשן למוטב הזה בלבד
  await admin
    .from('beneficiaries')
    .update({ portal_phone_code_hash: null, portal_phone_code_plain: null, portal_phone_code_expires: null, portal_phone_code_attempts: 0 })
    .eq('id', data.id)

  const { portal_phone_code_hash: _a, portal_phone_code_expires: _b, portal_phone_code_attempts: _c, ...beneficiary } = data
  void _a; void _b; void _c
  const documents = await loadDashboardDocs(admin, data.id)
  const response = NextResponse.json({ ok: true, beneficiary, documents })
  setPortalSession(response, data.id)
  return response
}
