import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { filterAccessibleInboundIds } from '@/lib/mailAccess'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  // read=false מסמן כלא-נקרא. ברירת המחדל true — תאימות לאחור עם קוראים
  // קיימים ששולחים רק id.
  const { id, ids, read } = await request.json()

  const requested: string[] = Array.isArray(ids) ? ids.filter(Boolean) : (id ? [id] : [])
  if (!requested.length) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // מסננים למיילים שהמשתמש מורשה להם בלבד — מונע שינוי מצב-קריאה חוצה-מחלקות
  // (וכן תמרון מוני ה-unread של מחלקות אחרות).
  const targets = await filterAccessibleInboundIds(admin, staff, requested)
  if (!targets.length) return NextResponse.json({ ok: true, updated: 0 })

  const isRead = read === false ? false : true
  await admin.from('inbound_emails').update({ is_read: isRead }).in('id', targets)

  return NextResponse.json({ ok: true, updated: targets.length, is_read: isRead })
}
