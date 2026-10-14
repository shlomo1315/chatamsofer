import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { normalizeEmail, cleanSubscriberName, subscribeGilyonot, parseImportText, MAX_IMPORT_ROWS } from '@/lib/gilyonot'

// רשימת התפוצה של הגיליון (app/admin/gilyonot): הוספה ידנית, ייבוא, הסרה/החזרה ומחיקה.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHUNK = 500

// POST { mode: 'add', email, name } | { mode: 'import', text }
export async function POST(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  if (body.mode === 'add') {
    const email = normalizeEmail(body.email)
    if (!email) return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
    const res = await subscribeGilyonot(db, { email, name: cleanSubscriberName(body.name), source: 'manual' })
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })
    await logActivity(db, { userId: staff.userId, action: 'gilyonot_subscriber_add', entityType: 'gilyonot_subscriber', details: { email, outcome: res.outcome } })
    return NextResponse.json({ ok: true, outcome: res.outcome })
  }

  if (body.mode === 'import') {
    const text = typeof body.text === 'string' ? body.text : ''
    const { rows, invalid } = parseImportText(text)
    if (!rows.length) return NextResponse.json({ error: 'לא נמצאו כתובות מייל תקינות' }, { status: 400 })
    if (rows.length > MAX_IMPORT_ROWS) return NextResponse.json({ error: `אפשר לייבא עד ${MAX_IMPORT_ROWS.toLocaleString('he-IL')} כתובות בפעם אחת` }, { status: 400 })

    // בייבוא אין חזרה של מי שהסיר את עצמו, ומי שכבר ברשימה לא נכנס שוב
    let added = 0, exists = 0, blocked = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { data: found, error } = await db.from('gilyonot_subscribers').select('email, status').in('email', chunk.map(r => r.email))
      if (error) return NextResponse.json({ error: 'הייבוא נכשל באמצע', added, exists, blocked }, { status: 500 })
      const known = new Map((found ?? []).map(f => [f.email as string, f.status as string]))
      for (const r of chunk) {
        const st = known.get(r.email)
        if (st === 'unsubscribed') blocked++
        else if (st) exists++
      }
      const fresh = chunk.filter(r => !known.has(r.email))
      if (fresh.length) {
        const { data: ins, error: insErr } = await db.from('gilyonot_subscribers')
          .upsert(fresh.map(r => ({ email: r.email, full_name: r.name, source: 'import' })), { onConflict: 'email', ignoreDuplicates: true })
          .select('id')
        if (insErr) return NextResponse.json({ error: 'הייבוא נכשל באמצע', added, exists, blocked }, { status: 500 })
        added += ins?.length ?? 0
        exists += fresh.length - (ins?.length ?? 0)
      }
    }
    await logActivity(db, { userId: staff.userId, action: 'gilyonot_import', entityType: 'gilyonot_subscriber', details: { added, exists, blocked, invalid } })
    return NextResponse.json({ ok: true, added, exists, blocked, invalid })
  }

  return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
}

// PATCH { id, status: 'active' | 'unsubscribed' }
export async function PATCH(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id : ''
  const status = body?.status
  if (!UUID_RE.test(id) || (status !== 'active' && status !== 'unsubscribed')) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const now = new Date().toISOString()
  const patch = status === 'unsubscribed'
    ? { status, unsubscribed_at: now, updated_at: now }
    : { status, unsubscribed_at: null, updated_at: now }
  const { error } = await db.from('gilyonot_subscribers').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_subscriber_status', entityType: 'gilyonot_subscriber', entityId: id, details: { status } })
  return NextResponse.json({ ok: true })
}

// DELETE ?id= — מחיקה מלאה (למשל כתובת שגויה). היסטוריית המשלוחים נשארת.
export async function DELETE(request: Request) {
  const staff = await requirePermission('gilyonot', 'delete')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const { error } = await db.from('gilyonot_subscribers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'המחיקה נכשלה' }, { status: 500 })
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_subscriber_delete', entityType: 'gilyonot_subscriber', entityId: id })
  return NextResponse.json({ ok: true })
}
