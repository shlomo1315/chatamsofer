// כלי אבחון (אנשי צוות בלבד) — שולף מימות סטטוס ודוח של קמפיין לפי campaignId,
// כדי לראות למה שיחה נחתכה (סיבת ניתוק, משך). קריאה בלבד.
// שימוש: /api/admin/yemot-campaign-report?id=<campaignId>[&account=bookfair]
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const YEMOT_API = 'https://www.call2all.co.il/ym/api'

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')?.trim()
  if (!id) return NextResponse.json({ error: 'חסר id של קמפיין' }, { status: 400 })

  const tokenName = request.nextUrl.searchParams.get('account') === 'bookfair' ? 'YEMOT_BOOK_FAIR_TOKEN' : 'YEMOT_TOKEN'
  const token = process.env[tokenName]
  if (!token) return NextResponse.json({ error: `${tokenName} אינו מוגדר` }, { status: 500 })

  const call = async (method: string) => {
    const form = new URLSearchParams({ token, campaignId: id })
    const res = await fetch(`${YEMOT_API}/${method}`, { method: 'POST', body: form })
    return res.json().catch(() => null)
  }
  try {
    const [status, report] = await Promise.all([call('GetCampaignStatus'), call('GetCampaignReport')])
    return NextResponse.json({ ok: true, status, report })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
