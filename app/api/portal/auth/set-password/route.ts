import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { setPortalSession } from '@/lib/portalSession'
import { passwordError, hashPassword, verifyCode } from '@/lib/portalPassword'
import { BENEFICIARY_SELECT, loadDashboardDocs, normalizeId, resolveBeneficiaryByEnteredId } from '@/lib/portalBeneficiary'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// אימות הקוד החד-פעמי וקביעת סיסמה חדשה. בהצלחה — כניסה אוטומטית (סשן פורטל).
export async function POST(request: NextRequest) {
  if (!rateLimit(`portal-setpw:${clientIp(request)}`, 15, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד מספר דקות.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const idNumber = normalizeId(body.idType, body.id)
  const code = String(body.code ?? '').replace(/\D/g, '')
  const password = String(body.password ?? '')

  if (!idNumber || idNumber.length < 5 || !code) {
    return NextResponse.json({ error: 'נא להזין את הקוד שנשלח למייל' }, { status: 400 })
  }
  const pwErr = passwordError(password)
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const data = await resolveBeneficiaryByEnteredId<{ id: string; portal_reset_code_hash: string | null; portal_reset_expires: string | null; portal_reset_attempts: number | null } & Record<string, unknown>>(
    admin, idNumber, `${BENEFICIARY_SELECT}, portal_reset_code_hash, portal_reset_expires, portal_reset_attempts`,
  )

  const invalid = () => NextResponse.json({ error: 'הקוד שגוי או שפג תוקפו. בקש קוד חדש.' }, { status: 400 })

  if (!data || !data.portal_reset_code_hash || !data.portal_reset_expires) return invalid()
  if (new Date(data.portal_reset_expires).getTime() < Date.now()) return invalid()
  if ((data.portal_reset_attempts ?? 0) >= 5) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות שגויים. בקש קוד חדש.' }, { status: 400 })
  }

  const codeOk = await verifyCode(code, data.portal_reset_code_hash)
  if (!codeOk) {
    await admin
      .from('beneficiaries')
      .update({ portal_reset_attempts: (data.portal_reset_attempts ?? 0) + 1 })
      .eq('id', data.id)
    return invalid()
  }

  const hash = await hashPassword(password)
  const { error: upErr } = await admin
    .from('beneficiaries')
    .update({ portal_password_hash: hash, portal_reset_code_hash: null, portal_reset_expires: null, portal_reset_attempts: 0 })
    .eq('id', data.id)
  if (upErr) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { portal_reset_code_hash: _a, portal_reset_expires: _b, portal_reset_attempts: _c, ...beneficiary } = data
  void _a; void _b; void _c
  const documents = await loadDashboardDocs(admin, data.id)
  const response = NextResponse.json({ ok: true, beneficiary, documents })
  setPortalSession(response, data.id)
  return response
}
