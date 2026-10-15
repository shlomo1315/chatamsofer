import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { getPullView, savePullConfig, loadSample, pullNedarimSubscribers } from '@/lib/gilyonotNedarimPull'

// משיכת נרשמים מטופס הגיליונות בנדרים פלוס (lib/gilyonotNedarimPull.ts).
// ⚠️ המפתח נכנס כאן ולא יוצא: GET מחזיר רק hasKey.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  return NextResponse.json(await getPullView(db))
}

// ⚠️ save ו-sample — מנהל בלבד: שינוי מספר טופס מאפשר למשוך נתונים מטפסים אחרים במוסד.
// pull נשאר בהרשאת עריכה, כי הוא מושך רק מהטופס שהמנהל הגדיר.
// POST { mode: 'save', mosadId, apiKey?, tofesId, emailField, nameField, consentField } | { mode: 'sample' } | { mode: 'pull' }
export async function POST(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  if ((body.mode === 'save' || body.mode === 'sample') && staff.role !== 'admin') return forbidden('רק מנהל יכול לשנות את הגדרות החיבור לנדרים')

  if (body.mode === 'save') {
    const res = await savePullConfig(db, body)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    await logActivity(db, { userId: staff.userId, action: 'gilyonot_nedarim_config', entityType: 'gilyonot_subscriber', details: { mosadId: body.mosadId, tofesId: body.tofesId, keyChanged: !!body.apiKey } })
    return NextResponse.json({ ok: true, view: await getPullView(db) })
  }

  if (body.mode === 'sample') {
    const res = await loadSample(db)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    return NextResponse.json({ ok: true, rows: res.rows })
  }

  if (body.mode === 'pull') {
    const res = await pullNedarimSubscribers(db)
    if (res.skipped === 'running') return NextResponse.json({ error: 'משיכה כבר רצה עכשיו. נסו שוב בעוד דקה.' }, { status: 409 })
    if (res.skipped === 'not_configured') return NextResponse.json({ error: 'צריך קודם להגדיר מוסד, מפתח, טופס ועמודת מייל' }, { status: 400 })
    await logActivity(db, { userId: staff.userId, action: 'gilyonot_nedarim_pull', entityType: 'gilyonot_subscriber', details: { added: res.added, lastId: res.lastId, error: res.error ?? null } })
    // ⚠️ לא 502: הפרוקסי של Railway מחליף גוף של 5xx, וההודעה בעברית לא הגיעה למסך
    return NextResponse.json({ ...res, view: await getPullView(db) }, { status: res.ok ? 200 : 422 })
  }

  return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
}
