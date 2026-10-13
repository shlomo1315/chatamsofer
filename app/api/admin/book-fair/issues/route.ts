import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import {
  parseNewIssue, buildIssuePatch, sanitizeSearch, parseDay,
  isIssueType, isIssueStatus, isUuid,
} from '@/lib/bookFairShippingIssues'

// ─────────────────────────────────────────────────────────────────────────────
// תקלות משלוח ביריד — רישום, עדכון וסינון.
//
// ⚠️ ברירת המחדל "לא טופלו" (פתוח + בטיפול): זה התור לעבודה.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SELECT = `
  id, order_id, issue_type, status, description, resolution_note,
  created_at, updated_at, resolved_at,
  order:book_fair_orders(id, order_number, customer_name, customer_phone, status)
`

/** GET — ?status=open|in_progress|resolved|all · type · from · to · q · order */
export async function GET(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const sp = request.nextUrl.searchParams
  let q = db.from('book_fair_shipping_issues')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(300)

  const status = sp.get('status')
  if (isIssueStatus(status)) q = q.eq('status', status)
  else if (status !== 'all') q = q.neq('status', 'resolved')

  const type = sp.get('type')
  if (isIssueType(type)) q = q.eq('issue_type', type)

  const orderId = sp.get('order')
  if (isUuid(orderId)) q = q.eq('order_id', orderId)

  // ⚠️ "עד" כולל את כל היום: מוסיפים יום ומשווים ב-lt.
  const from = parseDay(sp.get('from'))
  if (from) q = q.gte('created_at', `${from}T00:00:00+03:00`)
  const to = parseDay(sp.get('to'))
  if (to) {
    const next = new Date(`${to}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    q = q.lt('created_at', `${next.toISOString().slice(0, 10)}T00:00:00+03:00`)
  }

  // חיפוש: מספר הזמנה / שם / טלפון של הלקוח, או טקסט בתיאור.
  const term = sanitizeSearch(sp.get('q'))
  if (term) {
    const { data: orders } = await db.from('book_fair_orders')
      .select('id')
      .or(`order_number.ilike.*${term}*,customer_name.ilike.*${term}*,customer_phone.ilike.*${term}*`)
      .limit(300)
    const ids = (orders ?? []).map(o => o.id)
    q = ids.length
      ? q.or(`description.ilike.*${term}*,order_id.in.(${ids.join(',')})`)
      : q.ilike('description', `%${term}%`)
  }

  const { data, error } = await q
  if (error) {
    console.error('[book-fair/issues] שליפה נכשלה:', error.message)
    return NextResponse.json({ error: 'טעינת התקלות נכשלה' }, { status: 500 })
  }

  // ⚠️ Supabase מחזיר join של רבים-לאחד כאובייקט *או* כמערך.
  const issues = (data ?? []).map(r => ({
    ...r,
    order: Array.isArray(r.order) ? r.order[0] ?? null : r.order,
  }))

  return NextResponse.json({ issues }, { headers: { 'Cache-Control': 'no-store' } })
}

/** POST — רישום תקלה. מקבל orderId, או orderNumber כשמזינים ידנית. */
export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  let orderId = body.orderId
  if (!isUuid(orderId) && typeof body.orderNumber === 'string' && body.orderNumber.trim()) {
    const { data: o } = await db.from('book_fair_orders')
      .select('id').eq('order_number', body.orderNumber.trim().toUpperCase()).maybeSingle()
    if (!o) return NextResponse.json({ error: 'לא נמצאה הזמנה עם המספר הזה' }, { status: 404 })
    orderId = o.id
  }

  const parsed = parseNewIssue({ orderId, type: body.type, description: body.description })
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data: order } = await db.from('book_fair_orders')
    .select('id, order_number').eq('id', parsed.row.order_id).maybeSingle()
  if (!order) return NextResponse.json({ error: 'ההזמנה לא נמצאה' }, { status: 404 })

  const { data: row, error } = await db.from('book_fair_shipping_issues')
    .insert({ ...parsed.row, reported_by: staff.userId })
    .select('id').single()
  if (error || !row) {
    console.error('[book-fair/issues] רישום נכשל:', error?.message)
    return NextResponse.json({ error: 'רישום התקלה נכשל' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'create', entityType: 'book_fair_shipping_issue',
    entityId: row.id, details: { order: order.order_number, type: parsed.row.issue_type },
  })

  return NextResponse.json({ ok: true, id: row.id })
}

/** PATCH — עדכון סוג / תיאור / סטטוס / הערת טיפול. */
export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  if (!isUuid(body.id)) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const built = buildIssuePatch(body, staff.userId)
  if ('error' in built) return NextResponse.json({ error: built.error }, { status: 400 })

  const { data, error } = await db.from('book_fair_shipping_issues')
    .update(built.patch).eq('id', body.id).select('id')
  if (error) {
    console.error('[book-fair/issues] עדכון נכשל:', error.message)
    return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: 'התקלה לא נמצאה' }, { status: 404 })

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'book_fair_shipping_issue',
    entityId: body.id, details: { status: body.status, type: body.type },
  })

  return NextResponse.json({ ok: true })
}
