import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { getCurrentHeichalot, getNextIssueNumber, setNextIssueNumber } from '@/lib/gilyonotHeichalot'

// מספר הגיליון הבא (פ''א, פ''ב...). נשמר בשרת, ומתקדם אוטומטית בשליחה אמיתית.
export const dynamic = 'force-dynamic'

export async function GET() {
  const staff = await requirePermission('gilyonot', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const cur = await getCurrentHeichalot(db)
  return NextResponse.json({ nextIssueNumber: await getNextIssueNumber(db), currentHeichalot: cur ? { name: cur.name, month: cur.month } : null })
}

export async function PUT(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => ({})) as { nextIssueNumber?: unknown }
  const n = Number(body.nextIssueNumber)
  if (!Number.isInteger(n) || n < 1 || n > 999) return NextResponse.json({ error: 'מספר גיליון לא תקין (1 עד 999)' }, { status: 400 })
  if (!(await setNextIssueNumber(db, n))) return NextResponse.json({ error: 'השמירה נכשלה. ייתכן שהמיגרציה 20261118_gilyonot_heichalot.sql עוד לא הורצה.' }, { status: 500 })
  return NextResponse.json({ ok: true, nextIssueNumber: n })
}
