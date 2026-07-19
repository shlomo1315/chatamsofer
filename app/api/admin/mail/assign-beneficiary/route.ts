import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized, forbidden } from '@/lib/apiAuth'
import { canAccessInboundMail } from '@/lib/mailAccess'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()
  let body: { messageId?: string; beneficiaryId?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.messageId) return NextResponse.json({ error: 'חסר מזהה הודעה' }, { status: 400 })
  const db = admin()
  // מניעת שיוך חוצה-מחלקות על מיילי ארכיון: רק מי שמורשה לתיבה רשאי.
  if (!(await canAccessInboundMail(db, staff, String(body.messageId)))) return forbidden()
  const { data, error } = await db.from('inbound_emails')
    .update({ beneficiary_id: body.beneficiaryId ?? null })
    .eq('id', body.messageId)
    .eq('source', 'legacy')
    .select('id')
  if (error) return NextResponse.json({ error: 'שגיאה בשיוך' }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'המייל לא נמצא או אינו מייל ארכיון' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
