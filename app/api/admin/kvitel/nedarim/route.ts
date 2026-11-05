import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { getKvitelPullView, saveKvitelPullConfig, loadKvitelSample, pullKvitelFromNedarim } from '@/lib/kvitelNedarimPull'

// משיכת הגשות קוויטל מטופס בנדרים פלוס (lib/kvitelNedarimPull.ts).
// ⚠️ המפתח נכנס כאן ולא יוצא: GET מחזיר רק hasKey.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const staff = await requirePermission('kvitel', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  return NextResponse.json(await getKvitelPullView(db))
}

// ⚠️ save ו-sample — מנהל בלבד: שינוי מספר טופס מאפשר למשוך נתונים מטפסים אחרים במוסד.
// pull נשאר בהרשאת עריכה, כי הוא מושך רק מהטופס שהמנהל הגדיר.
// POST { mode: 'save', mosadId, apiKey?, tofesId, contactField, phoneField, emailField, textField, lines } | { mode: 'sample' } | { mode: 'pull' }
export async function POST(request: Request) {
  const staff = await requirePermission('kvitel', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  if ((body.mode === 'save' || body.mode === 'sample') && staff.role !== 'admin') return forbidden('רק מנהל יכול לשנות את הגדרות החיבור לנדרים')

  if (body.mode === 'save') {
    const res = await saveKvitelPullConfig(db, body)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    await logActivity(db, { userId: staff.userId, action: 'kvitel_nedarim_config', entityType: 'kvitel_request', details: { mosadId: body.mosadId, tofesId: body.tofesId, keyChanged: !!body.apiKey } })
    return NextResponse.json({ ok: true, view: await getKvitelPullView(db) })
  }

  if (body.mode === 'sample') {
    const res = await loadKvitelSample(db)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
    return NextResponse.json({ ok: true, rows: res.rows })
  }

  if (body.mode === 'pull') {
    const res = await pullKvitelFromNedarim(db)
    if (res.skipped === 'running') return NextResponse.json({ error: 'משיכה כבר רצה עכשיו. נסו שוב בעוד דקה.' }, { status: 409 })
    if (res.skipped === 'not_configured') return NextResponse.json({ error: 'צריך קודם להגדיר מוסד, מפתח, טופס ולפחות עמודת שמות אחת' }, { status: 400 })
    await logActivity(db, { userId: staff.userId, action: 'kvitel_nedarim_pull', entityType: 'kvitel_request', details: { added: res.added, lastId: res.lastId, error: res.error ?? null } })
    // ⚠️ לא 502: הפרוקסי מחליף גוף של 5xx, וההודעה בעברית לא מגיעה למסך
    return NextResponse.json({ ...res, view: await getKvitelPullView(db) }, { status: res.ok ? 200 : 422 })
  }

  return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
}
