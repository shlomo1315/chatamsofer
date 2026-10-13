import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { sanitizeSearch } from '@/lib/bookFairShippingIssues'

// בחירת הזמנה בטופס "תקלה חדשה": חיפוש לפי מספר / שם / טלפון (?q=),
// או הזמנה ידועה (?id=) כשנכנסים מכרטיס ההזמנה. מחזיר גם את פריטי
// ההזמנה — לבחירת "אילו ספרים".

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const sp = request.nextUrl.searchParams
  const id = sp.get('id') ?? ''
  const term = sanitizeSearch(sp.get('q'))
  if (!UUID_RE.test(id) && term.length < 2) return NextResponse.json({ orders: [] })

  let q = db.from('book_fair_orders')
    .select('id, order_number, customer_name, customer_phone, status, delivery_method, created_at')
    // ⚠️ TMP- היא שיחה שלא הגיעה לתשלום — לא הזמנה שנשלחה.
    .not('order_number', 'like', 'TMP-%')
    .order('created_at', { ascending: false })
    .limit(8)
  q = UUID_RE.test(id)
    ? q.eq('id', id)
    : q.or(`order_number.ilike.*${term}*,customer_name.ilike.*${term}*,customer_phone.ilike.*${term}*`)

  const { data: orders, error } = await q
  if (error) {
    console.error('[book-fair/shipping-issues/orders] חיפוש נכשל:', error.message)
    return NextResponse.json({ error: 'החיפוש נכשל' }, { status: 500 })
  }

  const ids = (orders ?? []).map(o => o.id as string)
  const { data: items } = ids.length
    ? await db.from('book_fair_order_items').select('id, order_id, title_snapshot, quantity').in('order_id', ids)
    : { data: [] as { id: string; order_id: string; title_snapshot: string; quantity: number }[] }

  return NextResponse.json({
    orders: (orders ?? []).map(o => ({
      ...o,
      items: (items ?? []).filter(i => i.order_id === o.id)
        .map(i => ({ id: i.id, title_snapshot: i.title_snapshot, quantity: i.quantity })),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
