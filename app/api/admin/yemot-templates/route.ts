// כלי אבחון (אנשי צוות בלבד) — שולף מימות את רשימת תבניות הקמפיין וה-id האמיתי
// שלהן, כדי לדעת מה לשים ב-YEMOT_OTP_TEMPLATE_ID. קריאה בלבד (GetTemplates) —
// אינה מוציאה שום שיחה.
import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const YEMOT_API = 'https://www.call2all.co.il/ym/api'

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })

  const token = process.env.YEMOT_TOKEN
  if (!token) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר' }, { status: 500 })

  const form = new URLSearchParams()
  form.set('token', token)

  try {
    const res = await fetch(`${YEMOT_API}/GetTemplates`, { method: 'POST', body: form })
    const json = await res.json().catch(() => null)
    return NextResponse.json({ ok: true, templates: json })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
