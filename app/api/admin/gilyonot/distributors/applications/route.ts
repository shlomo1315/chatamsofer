import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { createDistributorFrom } from '@/lib/gilyonotDistributorNedarim'
import { sendJoinApprovedMail } from '@/lib/gilyonotDistributorJoin'

// בקשות הצטרפות: מטופס ההצטרפות (reason='web') ונרשמים מנדרים שלא נכנסו אוטומטית.
// הוספה כמפיץ (החלטה ידנית) או דחייה. אישור בקשה מהטופס שולח לפונה מייל עם הפרטים.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PATCH { id, status: 'approved' | 'dismissed' }
export async function PATCH(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' && UUID_RE.test(body.id) ? body.id : null
  const status = body?.status === 'approved' || body?.status === 'dismissed' ? body.status : null
  if (!id || !status) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const { data: app } = await db.from('gilyonot_distributor_applications')
    .select('id, full_name, phone, email, city, synagogue, address, quantity, notes, reason, status').eq('id', id).maybeSingle()
  if (!app) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })
  if (app.status !== 'pending') return NextResponse.json({ error: 'הבקשה כבר טופלה' }, { status: 409 })
  if (status === 'approved' && !app.full_name) return NextResponse.json({ error: 'אי אפשר להוסיף מפיץ בלי שם. הוסיפו אותו ידנית ברשימת המפיצים' }, { status: 400 })

  const now = new Date().toISOString()
  // ⚠️ מותנה ב-status=pending: לחיצה כפולה לא תיצור שני מפיצים
  const { data: claimed, error } = await db.from('gilyonot_distributor_applications')
    .update({ status, handled_by: staff.userId, handled_at: now }).eq('id', id).eq('status', 'pending').select('id')
  if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  if (!claimed?.length) return NextResponse.json({ error: 'הבקשה כבר טופלה' }, { status: 409 })

  let distributorId: string | null = null
  let mailed = false
  if (status === 'approved') {
    const fromWeb = app.reason === 'web'
    const created = fromWeb
      ? await createDistributorFrom(db, app, 'הצטרף מטופס ההצטרפות באישור המשרד', 'web')
      : await createDistributorFrom(db, app, 'נוסף מנדרים פלוס באישור המשרד')
    if (!created.ok) {
      await db.from('gilyonot_distributor_applications').update({ status: 'pending', handled_by: null, handled_at: null }).eq('id', id)
      return NextResponse.json({ error: created.error }, { status: 500 })
    }
    distributorId = created.id
    await db.from('gilyonot_distributor_applications').update({ distributor_id: distributorId }).eq('id', id)
    if (fromWeb) mailed = await sendJoinApprovedMail(db, app).catch(() => false)
  }
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_distributor_application', entityType: 'gilyonot_distributor', details: { id, status, distributorId, mailed } })
  return NextResponse.json({ ok: true, distributorId, mailed })
}
