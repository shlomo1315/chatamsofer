import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { sendMaternityInquiry, type InquiryExtra } from '@/lib/maternityInquiry'

export const dynamic = 'force-dynamic'

// שרשור הבירור מול היולדת: קריאה ושליחה.
// ⚠️ אין middleware — הנתיב מגן על עצמו.

/** GET — כל ההודעות בתיק. צפייה בשרשור מסמנת את תשובות היולדת כנקראו. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePermission('maternity', 'view'))) {
    return forbidden('אין הרשאה לצפות בבירור')
  }
  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await db
    .from('maternity_messages')
    .select('id, direction, body, sender_name, created_at, is_read')
    .eq('aid_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'שגיאה בטעינת ההתכתבות' }, { status: 500 })

  // צפייה בשרשור = ההודעות נקראו (מסיר את החיווי)
  await db.from('maternity_messages')
    .update({ is_read: true })
    .eq('aid_id', id)
    .eq('direction', 'applicant')
    .eq('is_read', false)

  return NextResponse.json({ messages: data ?? [] })
}

/** POST — שליחת הודעת בירור ליולדת. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden('אין הרשאה לשלוח בירור')

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = (await request.json().catch(() => null)) as
    | { body?: string; extra?: InquiryExtra } | null

  // ⚠️ השם מ-profiles ולא staff.email: בשרשור הופיעה כתובת המייל של
  // המזכיר במקום שמו — גם מכוער וגם חושף כתובת פנימית בתצוגה.
  // אותו דפוס כמו בבירור ההלוואות.
  const { data: profile } = await db
    .from('profiles').select('full_name').eq('id', staff.userId).maybeSingle()
  const senderName = String((profile as { full_name?: string } | null)?.full_name ?? '').trim()
    || 'המזכירות'

  const res = await sendMaternityInquiry(
    db, id, body?.body ?? '',
    { id: staff.userId, name: senderName },
    body?.extra === 'lineage' ? 'lineage' : 'none',
  )

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
