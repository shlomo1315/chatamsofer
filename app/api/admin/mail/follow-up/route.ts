import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireMailAccess, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { canAccessInboundMail } from '@/lib/mailAccess'

export const dynamic = 'force-dynamic'

// ׳¡׳™׳׳•׳ ׳׳™׳™׳ ׳׳˜׳™׳₪׳•׳-׳‘׳”׳׳©׳ ׳‘׳׳•׳¢׳“ ׳׳¡׳•׳™׳ (׳׳• ׳‘׳™׳˜׳•׳ ׳¢׳ followUpAt=null).
// ׳›׳©׳”׳׳•׳¢׳“ ׳׳’׳™׳¢, ׳”׳׳™׳™׳ ׳§׳•׳₪׳¥ ׳׳¨׳׳© ׳¨׳©׳™׳׳× ׳”׳“׳•׳׳¨ ׳”׳ ׳›׳ ׳¡.
export async function POST(request: NextRequest) {
  const staff = await requireMailAccess()
  if (!staff) return unauthorized()

  const { messageId, followUpAt } = await request.json()
  if (!messageId) return NextResponse.json({ error: 'messageId ׳—׳¡׳¨' }, { status: 400 })

  // 🔴 בעלות-מחלקה — הייתה חסרה כאן בעוד היא קיימת בכל השכנות
  // (spam/trash/assign-beneficiary). נראה כהשמטה ולא כהחלטה: בלעדיה
  // כל בעל גישה לדואר יכול לקבוע תזכורת על מייל של מחלקה אחרת
  // ולהקפיץ אותו לראש הרשימה שלה.
  const gate = getServiceClient()
  if (!gate) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  if (!(await canAccessInboundMail(gate, staff, String(messageId)))) {
    return NextResponse.json({ error: 'ההודעה לא נמצאה' }, { status: 404 })
  }

  let value: string | null = null
  if (followUpAt) {
    const t = new Date(followUpAt).getTime()
    if (!Number.isFinite(t)) return NextResponse.json({ error: '׳×׳׳¨׳™׳ ׳׳ ׳×׳§׳™׳' }, { status: 400 })
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
