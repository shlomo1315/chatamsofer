import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { sendEmail, type EmailPayload } from '@/lib/email'
import { mailFor } from '@/lib/departments'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // שליחת מייל חופשי בשם הארגון — מוגבל למנהל בלבד (מניעת ניצול לפישינג/התחזות/ספאם)
  const staff = await requireAdmin()
  if (!staff) return NextResponse.json({ error: 'נדרשות הרשאות מנהל' }, { status: 403 })

  let body: { to: string; subject: string; html: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const result = await sendEmail(body as EmailPayload, mailFor('main'))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
