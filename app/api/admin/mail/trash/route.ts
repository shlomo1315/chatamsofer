import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized, forbidden } from '@/lib/apiAuth'
import { canAccessInboundMail } from '@/lib/mailAccess'

export const dynamic = 'force-dynamic'

// מחיקת מייל נכנס מהתיבה
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  // מניעת מחיקה חוצת-מחלקות: רק מי שמורשה לתיבת המייל רשאי למחוק אותו.
  if (!(await canAccessInboundMail(admin, staff, String(id)))) return forbidden()
  await admin.from('inbound_emails').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
