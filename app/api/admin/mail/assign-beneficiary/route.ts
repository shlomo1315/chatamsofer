import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

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
  const { error } = await admin().from('inbound_emails')
    .update({ beneficiary_id: body.beneficiaryId ?? null })
    .eq('id', body.messageId)
  if (error) return NextResponse.json({ error: 'שגיאה בשיוך' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
