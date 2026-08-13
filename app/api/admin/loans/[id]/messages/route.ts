import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'
import { sendLoanInquiry } from '@/lib/loanInquiry'

// שרשור ההתכתבות עם מבקש ההלוואה: קריאה ושליחה.
export const dynamic = 'force-dynamic'

/** GET — כל ההודעות בבקשה. סימון תשובות המבקש כנקראו. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('loans', 'view')
  if (!ctx || ctx instanceof NextResponse) {
    return ctx ?? NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const BASE = 'id, direction, body, sender_name, created_at, is_read'

  type MsgRow = {
    id: string; direction: string; body: string
    sender_name: string | null; created_at: string; is_read: boolean
    attachment_url?: string | null; attachment_name?: string | null
  }

  const first = await db
    .from('loan_messages')
    .select(`${BASE}, attachment_url, attachment_name`)
    .eq('loan_id', id)
    .order('created_at', { ascending: true })

  let data = first.data as MsgRow[] | null
  let error = first.error

  // ⚠️ עמידות למיגרציה שטרם הורצה: בלי הנפילה-לאחור *כל* שרשור הבירור
  // היה מחזיר שגיאה בגלל שתי עמודות תצוגה, וההתכתבות הייתה נעלמת מהמסך.
  if (error) {
    const retry = await db
      .from('loan_messages')
      .select(BASE)
      .eq('loan_id', id)
      .order('created_at', { ascending: true })
    data = retry.data as MsgRow[] | null
    error = retry.error
  }

  if (error) return NextResponse.json({ error: 'שגיאה בטעינת ההתכתבות' }, { status: 500 })

  // צפייה בשרשור = ההודעות נקראו (מסיר את ההתראה)
  await db.from('loan_messages')
    .update({ is_read: true })
    .eq('loan_id', id)
    .eq('direction', 'applicant')
    .eq('is_read', false)

  return NextResponse.json({ messages: data ?? [] })
}

/** POST — שליחת הודעת בירור למבקש. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('loans', 'edit')
  if (!ctx || ctx instanceof NextResponse) {
    return ctx ?? NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { message?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const text = String(body.message ?? '').trim()
  if (!text) return NextResponse.json({ error: 'ההודעה ריקה' }, { status: 400 })

  // שם הנציג — מוצג בצ'אט בממשק הניהול (לא נשלח למבקש).
  // ctx.email אינו מתאים: הוא הציג "4363773@gmail.com" במקום שם.
  const { data: profile } = await db
    .from('profiles').select('full_name').eq('id', ctx.userId).maybeSingle()

  const res = await sendLoanInquiry(db, id, text, {
    id: ctx.userId,
    name: String(profile?.full_name ?? '').trim() || 'צוות הגמ״ח',
  })

  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
