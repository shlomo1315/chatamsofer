import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { resolveAuthorName } from '@/lib/beneficiaryNotes'
import {
  parseWith, editIssueSchema, statusChangeSchema, noteSchema,
  resolveAffectedItems, buildStatusChange,
  type IssueStatus, type Resolution, type OrderItemRef,
} from '@/lib/bookFairShippingIssues'

// ─────────────────────────────────────────────────────────────────────────────
// תקלת משלוח בודדת: פרטים + יומן (GET), שינוי סטטוס / עריכה (PATCH),
// הוספת הערה ליומן (POST).
//
// ⚠️ אין DELETE: דיווח שגוי עובר ל"בוטל" ונשאר בתיעוד (אפיון).
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Ctx = { params: Promise<{ id: string }> }

async function issueId(ctx: Ctx): Promise<string | null> {
  const { id } = await ctx.params
  return UUID_RE.test(id) ? id : null
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const id = await issueId(ctx)
  if (!id) return NextResponse.json({ error: 'התקלה לא נמצאה' }, { status: 404 })

  const { data: issue, error } = await db.from('book_fair_shipping_issues')
    .select(`
      id, order_id, issue_type, status, resolution, description, reported_via,
      affected_items, created_at, updated_at, resolved_at,
      order:book_fair_orders(id, order_number, customer_name, customer_phone, status, delivery_method)
    `)
    .eq('id', id).maybeSingle()
  if (error) {
    console.error('[book-fair/shipping-issues] שליפה נכשלה:', error.message)
    return NextResponse.json({ error: 'טעינת התקלה נכשלה' }, { status: 500 })
  }
  if (!issue) return NextResponse.json({ error: 'התקלה לא נמצאה' }, { status: 404 })

  const [{ data: events }, { data: items }] = await Promise.all([
    db.from('book_fair_shipping_issue_events')
      .select('id, kind, body, from_status, to_status, resolution, author_name, created_at')
      .eq('issue_id', id).order('created_at', { ascending: true }),
    db.from('book_fair_order_items').select('id, title_snapshot, quantity').eq('order_id', issue.order_id),
  ])

  return NextResponse.json({
    issue: { ...issue, order: Array.isArray(issue.order) ? issue.order[0] ?? null : issue.order },
    events: events ?? [],
    orderItems: items ?? [],
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/** PATCH — { action: 'status', status, resolution? } או { action: 'edit', type, description, via?, items? } */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const id = await issueId(ctx)
  if (!id) return NextResponse.json({ error: 'התקלה לא נמצאה' }, { status: 404 })

  const raw = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 })
  const { action, ...body } = raw

  const { data: current } = await db.from('book_fair_shipping_issues')
    .select('id, order_id, status, resolution').eq('id', id).maybeSingle()
  if (!current) return NextResponse.json({ error: 'התקלה לא נמצאה' }, { status: 404 })

  const authorName = await resolveAuthorName(db, staff.userId)

  if (action === 'status') {
    const parsed = parseWith(statusChangeSchema, body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const built = buildStatusChange(
      { status: current.status as IssueStatus, resolution: current.resolution as Resolution | null },
      parsed.data, staff.userId,
    )
    if ('error' in built) return NextResponse.json({ error: built.error }, { status: 400 })

    const { error } = await db.from('book_fair_shipping_issues').update(built.patch).eq('id', id)
    if (error) {
      console.error('[book-fair/shipping-issues] עדכון סטטוס נכשל:', error.message)
      return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })
    }
    const { error: evErr } = await db.from('book_fair_shipping_issue_events').insert({
      issue_id: id, ...built.event, created_by: staff.userId, author_name: authorName,
    })
    if (evErr) console.error('[book-fair/shipping-issues] רישום ביומן נכשל:', evErr.message)
    await logActivity(db, {
      userId: staff.userId, action: 'update', entityType: 'book_fair_shipping_issue',
      entityId: id, details: { status: parsed.data.status, resolution: built.event.resolution },
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'edit') {
    const parsed = parseWith(editIssueSchema, body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { data: orderItems } = await db.from('book_fair_order_items')
      .select('id, title_snapshot, quantity').eq('order_id', current.order_id)
    const affected = resolveAffectedItems(parsed.data.type, parsed.data.items, (orderItems ?? []) as OrderItemRef[])
    if ('error' in affected) return NextResponse.json({ error: affected.error }, { status: 400 })

    const { error } = await db.from('book_fair_shipping_issues').update({
      issue_type: parsed.data.type,
      description: parsed.data.description,
      reported_via: parsed.data.via ?? null,
      affected_items: affected.items,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) {
      console.error('[book-fair/shipping-issues] עריכה נכשלה:', error.message)
      return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })
    }
    const { error: evErr } = await db.from('book_fair_shipping_issue_events').insert({
      issue_id: id, kind: 'edit', body: 'פרטי התקלה נערכו', created_by: staff.userId, author_name: authorName,
    })
    if (evErr) console.error('[book-fair/shipping-issues] רישום ביומן נכשל:', evErr.message)
    await logActivity(db, {
      userId: staff.userId, action: 'update', entityType: 'book_fair_shipping_issue',
      entityId: id, details: { edit: true, type: parsed.data.type },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
}

/** POST — הערה ליומן הטיפול. */
export async function POST(request: NextRequest, ctx: Ctx) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const id = await issueId(ctx)
  if (!id) return NextResponse.json({ error: 'התקלה לא נמצאה' }, { status: 404 })

  const parsed = parseWith(noteSchema, await request.json().catch(() => null))
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data: exists } = await db.from('book_fair_shipping_issues').select('id').eq('id', id).maybeSingle()
  if (!exists) return NextResponse.json({ error: 'התקלה לא נמצאה' }, { status: 404 })

  const { error } = await db.from('book_fair_shipping_issue_events').insert({
    issue_id: id, kind: 'note', body: parsed.data.body,
    created_by: staff.userId, author_name: await resolveAuthorName(db, staff.userId),
  })
  if (error) {
    console.error('[book-fair/shipping-issues] הערה נכשלה:', error.message)
    return NextResponse.json({ error: 'שמירת ההערה נכשלה' }, { status: 500 })
  }
  // ⚠️ "עודכן" בטבלה משקף גם הערה — זו פעילות בתקלה.
  await db.from('book_fair_shipping_issues').update({ updated_at: new Date().toISOString() }).eq('id', id)

  return NextResponse.json({ ok: true })
}
