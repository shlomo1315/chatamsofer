import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// סימון מייל לטיפול-בהמשך במועד מסוים (או ביטול עם followUpAt=null).
// כשהמועד מגיע, המייל קופץ לראש רשימת הדואר הנכנס.
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const { messageId, followUpAt } = await request.json()
  if (!messageId) return NextResponse.json({ error: 'messageId חסר' }, { status: 400 })

  let value: string | null = null
  if (followUpAt) {
    const t = new Date(followUpAt).getTime()
    if (!Number.isFinite(t)) return NextResponse.json({ error: 'תאריך לא תקין' }, { status: 400 })
    value = new Date(t).toISOString()
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error } = await admin.from('inbound_emails').update({ follow_up_at: value }).eq('id', messageId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
