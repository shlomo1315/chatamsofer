import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET — לידות של המוטב שסומן בהן מין אך טרם הוזן שם (להשלמה בכניסה לפורטל)
export async function GET(request: NextRequest) {
  const beneficiaryId = new URL(request.url).searchParams.get('beneficiary_id')
  if (!beneficiaryId) return NextResponse.json({ pending: [] })
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== beneficiaryId) return NextResponse.json({ pending: [] })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ pending: [] })
  const { data } = await admin.from('maternity_aids')
    .select('id, baby_name, baby_gender, birth_date, birth_type')
    .eq('beneficiary_id', beneficiaryId)
    .order('created_at', { ascending: false })

  const pending = (data ?? [])
    .filter((m: { baby_name?: string | null; baby_gender?: string | null; birth_type?: string | null }) =>
      (m.birth_type ?? 'live') !== 'silent' && !!m.baby_gender && !(m.baby_name && String(m.baby_name).trim()))
    .map((m: { id: string; baby_gender?: string | null; birth_date?: string | null }) =>
      ({ id: m.id, baby_gender: m.baby_gender, birth_date: m.birth_date }))

  return NextResponse.json({ pending }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST — השלמת שם הילד ({ beneficiary_id, maternity_id, baby_name })
export async function POST(request: NextRequest) {
  let body: { beneficiary_id?: string; maternity_id?: string; baby_name?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const { beneficiary_id, maternity_id, baby_name } = body
  if (!beneficiary_id || !maternity_id || !baby_name?.trim()) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  }
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== beneficiary_id) {
    return NextResponse.json({ error: 'נדרש אימות מחדש' }, { status: 401 })
  }
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // עדכון רק אם הלידה שייכת למוטב (אימות בעלות)
  const { error } = await admin.from('maternity_aids')
    .update({ baby_name: baby_name.trim(), updated_at: new Date().toISOString() })
    .eq('id', maternity_id)
    .eq('beneficiary_id', beneficiary_id)
  if (error) return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
