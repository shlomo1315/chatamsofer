import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'
import { sendAidInquiry, isAidSource } from '@/lib/aidInquiry'

// שרשור ההתכתבות בכרטסת של מחלקת סיוע: קריאה ושליחה.
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ source: string; id: string }> }

// הרשאה לפי מקור הכרטסת: בקשות סיוע = financial_aid, בקשות אלמנה = widows.
const sectionOf = (source: string) => (source === 'widow_requests' ? 'widows' : 'financial_aid') as 'widows' | 'financial_aid'

export async function GET(_req: NextRequest, { params }: Params) {
  const { source, id } = await params
  if (!isAidSource(source)) return NextResponse.json({ error: 'מקור לא תקין' }, { status: 400 })
  const ctx = await requirePermission(sectionOf(source), 'view')
  if (!ctx || ctx instanceof NextResponse) return ctx ?? NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await db.from('aid_messages')
    .select('id, direction, body, sender_name, created_at, is_read, attachment_url, attachment_name')
    .eq('source_table', source).eq('request_id', id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: 'שגיאה בטעינת ההתכתבות' }, { status: 500 })

  await db.from('aid_messages').update({ is_read: true })
    .eq('source_table', source).eq('request_id', id).eq('direction', 'applicant').eq('is_read', false)

  return NextResponse.json({ messages: data ?? [] })
}

export async function POST(request: NextRequest, { params }: Params) {
  const { source, id } = await params
  if (!isAidSource(source)) return NextResponse.json({ error: 'מקור לא תקין' }, { status: 400 })
  const ctx = await requirePermission(sectionOf(source), 'edit')
  if (!ctx || ctx instanceof NextResponse) return ctx ?? NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { message?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const text = String(body.message ?? '').trim()
  if (!text) return NextResponse.json({ error: 'ההודעה ריקה' }, { status: 400 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', ctx.userId).maybeSingle()
  const res = await sendAidInquiry(db, source, id, text, {
    id: ctx.userId,
    name: String(profile?.full_name ?? '').trim() || 'צוות מחלקת סיוע',
  })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
