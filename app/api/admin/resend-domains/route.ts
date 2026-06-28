// כלי אבחון (אנשי צוות בלבד) — מציג את מצב הדומיינים והמפתח ב-Resend, כדי לדעת
// למה שליחת מייל נכשלת ("domain not verified"). קריאה בלבד.
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })

  const key = process.env.RESEND_API_KEY
  if (!key) return NextResponse.json({ error: 'RESEND_API_KEY אינו מוגדר' }, { status: 500 })

  try {
    const resend = new Resend(key)
    const res = await resend.domains.list()
    // מחזירים שם + סטטוס לכל דומיין (לא חושפים סודות)
    return NextResponse.json({ ok: true, keyPrefix: key.slice(0, 6) + '…', domains: res })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
