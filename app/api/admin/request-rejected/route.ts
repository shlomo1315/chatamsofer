import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requirePermission, forbidden } from '@/lib/apiAuth'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { birthRejectedEmail } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// נקרא כאשר המזכיר דוחה בקשת לידה (סטטוס 'cancelled') עם סיבה:
// שולח ליולדת מייל מעוצב "בקשת הלידה נדחתה" עם הסיבה שהוזנה.
// (הפנייה היא ליולדת — האשה — לפי מוסכמת המיילים של עזר יולדות.)
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  let body: { id?: string; reason?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const id = String(body.id ?? '')
  const reason = String(body.reason ?? '').trim()
  if (!id) return NextResponse.json({ error: 'פרמטרים חסרים' }, { status: 400 })

  if (!(await requirePermission('maternity', 'edit'))) return forbidden()

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: aid, error } = await admin
    .from('maternity_aids')
    .select('id, beneficiary:beneficiaries(email, family_name, full_name, spouse_name)')
    .eq('id', id)
    .maybeSingle()

  if (error || !aid) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })

  const benRaw = (aid as unknown as Record<string, unknown>).beneficiary
  const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as {
    email?: string | null; family_name?: string | null; full_name?: string | null; spouse_name?: string | null
  } | null

  const email = ben?.email?.trim()
  if (!email) {
    // אין כתובת מייל ליולדת — הדחייה עצמה כבר נשמרה, רק אין למי לשלוח.
    return NextResponse.json({ ok: true, sent: false, reason: 'no-email' })
  }

  const mail = birthRejectedEmail({
    family_name: ben?.family_name,
    mother_name: ben?.spouse_name || ben?.full_name,
    reason,
  })

  try {
    const sent = await deliverMail(email, mail.subject, mail.html, undefined, mailFor('maternity'))
    if (!sent.ok) {
      console.error('[request-rejected] mail failed:', sent.error)
      return NextResponse.json({ ok: true, sent: false })
    }
  } catch (e) {
    console.error('[request-rejected] mail threw:', e)
    return NextResponse.json({ ok: true, sent: false })
  }

  return NextResponse.json({ ok: true, sent: true })
}
