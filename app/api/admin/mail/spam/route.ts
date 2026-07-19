import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized, forbidden } from '@/lib/apiAuth'
import { canAccessInboundMail } from '@/lib/mailAccess'

export const dynamic = 'force-dynamic'

// סימון/ביטול ספאם למייל נכנס
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const { messageId, isSpam } = await request.json()
  if (!messageId) return NextResponse.json({ error: 'messageId חסר' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  // מניעת הסתרת מייל של מחלקה זרה: רק מי שמורשה לתיבה רשאי לסמן/לבטל ספאם.
  if (!(await canAccessInboundMail(admin, staff, String(messageId)))) return forbidden()
  const { error } = await admin.from('inbound_emails').update({ is_spam: !!isSpam }).eq('id', messageId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
