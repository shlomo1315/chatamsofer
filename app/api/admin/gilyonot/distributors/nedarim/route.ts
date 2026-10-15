import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { getDistNedarimView, loadDistSample, pullNedarimDistributors, saveDistNedarimConfig } from '@/lib/gilyonotDistributorNedarim'

// הרשמת מפיצים מטופס בנדרים פלוס (lib/gilyonotDistributorNedarim.ts).
// המוסד והמפתח משותפים למשיכת הנרשמים לגיליונות, ולכן כאן אין מפתח בכלל.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  return NextResponse.json(await getDistNedarimView(db))
}

// ⚠️ save ו-sample מנהל בלבד, כמו במשיכת הנרשמים: מספר טופס אחר = נתונים מטפסים אחרים במוסד.
// POST { mode: 'save', tofesId, nameField, ... } | { mode: 'sample' } | { mode: 'pull' }
export async function POST(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  if ((body.mode === 'save' || body.mode === 'sample') && staff.role !== 'admin') return forbidden('רק מנהל יכול לשנות את הגדרות החיבור לנדרים')

  if (body.mode === 'save') {
    const res = await saveDistNedarimConfig(db, body)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    await logActivity(db, { userId: staff.userId, action: 'gilyonot_distributors_nedarim_config', entityType: 'gilyonot_distributor', details: { tofesId: body.tofesId } })
    return NextResponse.json({ ok: true, view: await getDistNedarimView(db) })
  }

  if (body.mode === 'sample') {
    const res = await loadDistSample(db)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    return NextResponse.json({ ok: true, rows: res.rows })
  }

  if (body.mode === 'pull') {
    const res = await pullNedarimDistributors(db)
    if (res.skipped === 'running') return NextResponse.json({ error: 'משיכה כבר רצה עכשיו. נסו שוב בעוד דקה.' }, { status: 409 })
    if (res.skipped === 'not_configured') return NextResponse.json({ error: 'צריך קודם מוסד ומפתח (בהגדרות הנרשמים), מספר טופס ועמודות שם, טלפון ובית כנסת' }, { status: 400 })
    await logActivity(db, { userId: staff.userId, action: 'gilyonot_distributors_nedarim_pull', entityType: 'gilyonot_distributor', details: { added: res.added, held: res.held, lastId: res.lastId, error: res.error ?? null } })
    return NextResponse.json({ ...res, view: await getDistNedarimView(db) }, { status: res.ok ? 200 : 502 })
  }

  return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
}
