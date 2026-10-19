// כלי אבחון (אנשי צוות בלבד) — שולף מימות את רשימת תבניות הקמפיין וה-id האמיתי
// שלהן, כדי לדעת מה לשים ב-YEMOT_OTP_TEMPLATE_ID. קריאה בלבד (GetTemplates) —
// אינה מוציאה שום שיחה.
// ברירת מחדל: החשבון הכללי (YEMOT_TOKEN). חשבון היריד: /api/admin/yemot-templates?account=bookfair
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const YEMOT_API = 'https://www.call2all.co.il/ym/api'

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })

  const tokenName = request.nextUrl.searchParams.get('account') === 'bookfair' ? 'YEMOT_BOOK_FAIR_TOKEN' : 'YEMOT_TOKEN'
  const token = process.env[tokenName]
  if (!token) return NextResponse.json({ error: `${tokenName} אינו מוגדר` }, { status: 500 })

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
