import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getNedarimCreds, deleteClient } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// מחיקת משפחה מנדרים קארד — כשמשפחה כבר אינה מאושרת (נדחתה / חזרה לממתין וכו')
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin', 'collections', 'secretary']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  let body: { beneficiaryId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.beneficiaryId) return NextResponse.json({ error: 'חסר מזהה צאצא' }, { status: 400 })

  const { data: b } = await admin
    .from('beneficiaries')
    .select('id, nedarim_id')
    .eq('id', body.beneficiaryId)
    .maybeSingle()
  // אין משפחה / לא קיימת בנדרים → אין מה למחוק
  if (!b || !b.nedarim_id) return NextResponse.json({ ok: true, skipped: true })

  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ ok: false, notConfigured: true })

  try {
    const r = await deleteClient(creds, String(b.nedarim_id))
    // בכל מקרה מנקים את המזהה אצלנו (אם נמחק בנדרים, או אם כבר לא קיים שם)
    await admin.from('beneficiaries').update({ nedarim_id: null }).eq('id', b.id)
    return NextResponse.json({ ok: r.ok, message: r.message })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 502 })
  }
}
