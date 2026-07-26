import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// סימון התראה כ"טופל" — מסיר אותה מהפעמון. כרגע ההתראות הן תשובות בבירורי
// הלוואות (loan_messages); סימון = is_read=true, כך שלא תחזור.
// body: { id, kind }
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { id?: string; kind?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  if (body.kind === 'loan_reply' || !body.kind) {
    const { error } = await db.from('loan_messages').update({ is_read: true }).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
