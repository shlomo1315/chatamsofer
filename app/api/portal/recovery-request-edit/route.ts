import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { portalCookieName } from '../login/route'
import { verifyRecoveryPortalToken } from '@/lib/recoveryPortalAuth'
import { deliverMail } from '@/lib/sendMail'
import { recoveryEditRequestEmail } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

type Ben = { family_name?: string | null; full_name?: string | null; spouse_name?: string | null }
const motherName = (b?: Ben | null) =>
  b ? [b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || '—' : '—'

// בית ההחלמה מבקש לפתוח רשומה נעולה לתיקון. מסמן זמן בקשה ושולח מייל התראה.
export async function POST(request: NextRequest) {
  const { home, aidId } = await request.json()
  if (!home || !aidId) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })

  const cookieStore = await cookies()
  if (!verifyRecoveryPortalToken(cookieStore.get(portalCookieName(home))?.value, home)) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: aid } = await admin.from('maternity_aids')
    .select('id, recovery_home, beneficiaries(family_name, full_name, spouse_name)')
    .eq('id', aidId).maybeSingle()
  if (!aid || aid.recovery_home !== home) {
    return NextResponse.json({ error: 'הרשומה לא נמצאה בבית החלמה זה' }, { status: 404 })
  }

  await admin.from('maternity_aids')
    .update({ recovery_edit_requested_at: new Date().toISOString() }).eq('id', aidId)

  try {
    const { data: rh } = await admin.from('recovery_homes').select('report_email').eq('name', home).maybeSingle()
    if (rh?.report_email) {
      const ben = Array.isArray(aid.beneficiaries) ? aid.beneficiaries[0] : aid.beneficiaries
      const mail = recoveryEditRequestEmail({ home, motherName: motherName(ben) })
      await deliverMail(rh.report_email, mail.subject, mail.html)
    }
  } catch { /* כשל מייל לא חוסם */ }

  return NextResponse.json({ ok: true })
}
