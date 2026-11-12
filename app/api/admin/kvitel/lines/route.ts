import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { validateLines } from '@/lib/kvitel'

// תיקון שמות של בקשה (הכרטסת ב-app/admin/kvitel).
// PUT { id, lines: [{ name, relation, parentName, requestType, requestNote }] } — מחליף את שורות הבקשה בשורות המתוקנות.
// אפשר לצרף contact { name, phone, email } לעדכון פרטי המגיש. הסטטוס לא משתנה כאן.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const clean = (v: unknown, max: number): string | null | undefined =>
  v === undefined ? undefined : typeof v === 'string' && v.trim().length <= max ? v.trim() || null : undefined

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PUT(request: NextRequest) {
  const staff = await requirePermission('kvitel', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown> | null = null
  try { body = await request.json() } catch { /* נבדק מיד */ }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 })

  const id = typeof body.id === 'string' && UUID_RE.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const v = validateLines(body.lines)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  let contact: Record<string, string | null> | null = null
  if (body.contact !== undefined) {
    const c = body.contact as Record<string, unknown> | null
    if (!c || typeof c !== 'object') return NextResponse.json({ error: 'פרטי מגיש שגויים' }, { status: 400 })
    const name = clean(c.name, 120), phone = clean(c.phone, 40), email = clean(c.email, 200)
    if (name === undefined || phone === undefined || email === undefined) return NextResponse.json({ error: 'פרטי מגיש שגויים' }, { status: 400 })
    contact = { contact_name: name, contact_phone: phone, contact_email: email }
  }

  const { data: req } = await db.from('kvitel_requests').select('id').eq('id', id).maybeSingle()
  if (!req) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })
  const { data: old } = await db.from('kvitel_request_lines').select('id').eq('request_id', id)

  // קודם מוסיפים את החדשות ורק אחר כך מוחקים את הישנות, כדי שכשל באמצע לא ימחק שמות.
  const { error: insErr } = await db.from('kvitel_request_lines').insert(v.lines.map((l, i) => ({
    request_id: id, position: i, name: l.name, relation: l.relation, parent_name: l.parentName,
    request_type: l.requestType, request_note: l.requestNote ?? null, flagged: false, flag_reason: null,
  })))
  if (insErr) {
    console.error('[kvitel] lines edit insert failed:', insErr)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }
  const oldIds = (old ?? []).map(o => o.id as string)
  if (oldIds.length) {
    const { error: delErr } = await db.from('kvitel_request_lines').delete().in('id', oldIds)
    if (delErr) {
      console.error('[kvitel] lines edit delete failed:', delErr)
      return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
    }
  }

  if (contact) {
    const { error: cErr } = await db.from('kvitel_requests').update(contact).eq('id', id)
    if (cErr) {
      console.error('[kvitel] contact edit failed:', cErr)
      return NextResponse.json({ error: 'השמות נשמרו, אך פרטי המגיש לא' }, { status: 500 })
    }
  }

  await logActivity(db, {
    userId: staff.userId, action: 'kvitel_lines_edit', entityType: 'kvitel_request', entityId: id,
    details: { lines: v.lines.length, replaced: oldIds.length, contact: !!contact },
  })
  return NextResponse.json({ ok: true, lines: v.lines.length })
}
