import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, forbidden } from '@/lib/apiAuth'
import {
  SYSTEM_IDS, isSystemId, systemStatus, accountConfig, applyTree, maskedUrls,
  uploadRecording, listRecordings, accountOverview, buyNumber, callConfigured,
} from '@/lib/telephony/admin'

// ניהול טכנוליין: מצב, בניית עץ שלוחות, הקלטות ורכישת מספרים. מנהלים בלבד.
export const dynamic = 'force-dynamic'

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET(req: NextRequest) {
  if (!(await requireStaff(['admin']))) return forbidden()
  const sys = req.nextUrl.searchParams.get('system')
  if (sys) {
    if (!isSystemId(sys)) return bad('מערכת לא מוכרת')
    const ext = req.nextUrl.searchParams.get('extensionId') ?? ''
    if (!/^\d+$/.test(ext)) return bad('מזהה שלוחה לא תקין')
    const res = await listRecordings(sys, ext)
    return res.ok ? NextResponse.json({ data: res.data }) : bad(res.error, 502)
  }
  const account = accountConfig()
  const me = account.accountKey ? await accountOverview() : null
  return NextResponse.json({
    systems: SYSTEM_IDS.map((id) => ({ ...systemStatus(id), urls: maskedUrls(SITE(), id), callsReady: callConfigured(id) })),
    account: {
      hasKey: !!account.accountKey, monthlyCap: account.monthlyCap, outboundEnabled: account.outboundEnabled,
      overview: me && me.ok ? me.data : null, overviewError: me && !me.ok ? me.error : null,
    },
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff(['admin']))) return forbidden()
  const type = req.headers.get('content-type') ?? ''

  if (type.includes('multipart/form-data')) {
    const f = await req.formData()
    const sys = String(f.get('system') ?? '')
    const file = f.get('file')
    if (!isSystemId(sys)) return bad('מערכת לא מוכרת')
    if (!(file instanceof File)) return bad('לא נבחר קובץ')
    const res = await uploadRecording(sys, String(f.get('extensionId') ?? ''), String(f.get('name') ?? file.name), await file.arrayBuffer(), file.name)
    return res.ok ? NextResponse.json({ ok: true }) : bad(res.error, 502)
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return bad('בקשה לא תקינה')
  const sys = String(body.system ?? '')

  if (body.action === 'tree') {
    if (!isSystemId(sys)) return bad('מערכת לא מוכרת')
    const steps = await applyTree(sys, String(body.rootId ?? ''), SITE())
    return NextResponse.json({ steps })
  }
  if (body.action === 'buy') {
    const res = await buyNumber({
      systemId: String(body.systemId ?? ''), groupId: String(body.groupId ?? ''),
      number: String(body.number ?? ''), price: Number(body.price) || 0,
    })
    return res.ok ? NextResponse.json({ ok: true }) : bad(res.error, 502)
  }
  return bad('פעולה לא מוכרת')
}
