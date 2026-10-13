import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { resolveAuthorName } from '@/lib/beneficiaryNotes'
import {
  parseWith, newIssueSchema, resolveAffectedItems, parseFilters, sanitizeSearch, nextDay,
  matchesChip, chipCounts, type IssueStatus, type OrderItemRef,
} from '@/lib/bookFairShippingIssues'

// ─────────────────────────────────────────────────────────────────────────────
// תקלות משלוח ביריד — רשימה מסוננת ורישום תקלה חדשה.
// אפיון: docs/book-fair-shipping-issues.md
//
// ⚠️ המונים בצ'יפים מחושבים על אותם מסננים (סוג/תאריך/חיפוש) בלי
// הסטטוס — כך "פתוחות 3" תמיד תואם למה שיופיע בלחיצה.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SELECT = `
  id, order_id, issue_type, status, resolution, description, reported_via,
  affected_items, created_at, updated_at, resolved_at,
  order:book_fair_orders(id, order_number, customer_name, customer_phone)
`

/** GET — ?status=active|open|in_progress|resolved|all · type · from · to · q */
export async function GET(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const sp = request.nextUrl.searchParams
  const f = parseFilters(k => sp.get(k))

  let q = db.from('book_fair_shipping_issues')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(500)

  if (f.type) q = q.eq('issue_type', f.type)
  // ⚠️ הימים לפי שעון ישראל; "עד" כולל את כל היום.
  if (f.from) q = q.gte('created_at', `${f.from}T00:00:00+03:00`)
  if (f.to) q = q.lt('created_at', `${nextDay(f.to)}T00:00:00+03:00`)

  // חיפוש: מספר הזמנה / שם / טלפון של הלקוח.
  const term = sanitizeSearch(f.q)
  if (term) {
    const { data: orders } = await db.from('book_fair_orders')
      .select('id')
      .or(`order_number.ilike.*${term}*,customer_name.ilike.*${term}*,customer_phone.ilike.*${term}*`)
      .limit(300)
    const ids = (orders ?? []).map(o => o.id as string)
    if (!ids.length) {
      return NextResponse.json({ issues: [], counts: chipCounts([]) }, { headers: { 'Cache-Control': 'no-store' } })
    }
    q = q.in('order_id', ids)
  }

  const { data, error } = await q
  if (error) {
    console.error('[book-fair/shipping-issues] שליפה נכשלה:', error.message)
    return NextResponse.json({ error: 'טעינת התקלות נכשלה' }, { status: 500 })
  }

  // ⚠️ Supabase מחזיר join של רבים-לאחד כאובייקט *או* כמערך.
  const rows = (data ?? []).map(r => ({
    ...r,
    order: Array.isArray(r.order) ? r.order[0] ?? null : r.order,
  }))

  return NextResponse.json({
    issues: rows.filter(r => matchesChip(r.status as IssueStatus, f.chip)),
    counts: chipCounts(rows.map(r => r.status as IssueStatus)),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/** POST — רישום תקלה חדשה. */
export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const parsed = parseWith(newIssueSchema, await request.json().catch(() => null))
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const input = parsed.data

  // 🔴 ההזמנה חייבת להתקיים — מזהה שרירותי לא ייצור תקלה יתומה.
  const [{ data: order }, { data: orderItems }] = await Promise.all([
    db.from('book_fair_orders').select('id, order_number').eq('id', input.orderId).maybeSingle(),
    db.from('book_fair_order_items').select('id, title_snapshot, quantity').eq('order_id', input.orderId),
  ])
  if (!order) return NextResponse.json({ error: 'ההזמנה לא נמצאה' }, { status: 404 })

  const affected = resolveAffectedItems(input.type, input.items, (orderItems ?? []) as OrderItemRef[])
  if ('error' in affected) return NextResponse.json({ error: affected.error }, { status: 400 })

  const { data: row, error } = await db.from('book_fair_shipping_issues').insert({
    order_id: input.orderId,
    issue_type: input.type,
    description: input.description,
    reported_via: input.via ?? null,
    affected_items: affected.items,
    created_by: staff.userId,
  }).select('id').single()
  if (error || !row) {
    console.error('[book-fair/shipping-issues] רישום נכשל:', error?.message)
    return NextResponse.json({ error: 'שמירת התקלה נכשלה' }, { status: 500 })
  }

  const { error: evErr } = await db.from('book_fair_shipping_issue_events').insert({
    issue_id: row.id, kind: 'status', from_status: null, to_status: 'open',
    created_by: staff.userId, author_name: await resolveAuthorName(db, staff.userId),
  })
  if (evErr) console.error('[book-fair/shipping-issues] רישום ביומן נכשל:', evErr.message)

  await logActivity(db, {
    userId: staff.userId, action: 'create', entityType: 'book_fair_shipping_issue',
    entityId: row.id, details: { order: order.order_number, type: input.type },
  })

  return NextResponse.json({ ok: true, id: row.id })
}
