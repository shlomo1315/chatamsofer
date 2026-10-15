import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { rateLimit } from '@/lib/rateLimit'
import { DISTRIBUTOR_COOKIE, loginKey, identityFilter, readSessionToken } from '@/lib/gilyonotDistributorAuth'
import { runDistributorAction } from '@/lib/gilyonotDistributorServer'

// ממשק המפיץ: הנתונים שלו (GET) וביצוע פעולה (POST). הזהות רק מהעוגייה החתומה.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function session() {
  return readSessionToken((await cookies()).get(DISTRIBUTOR_COOKIE)?.value)
}

export async function GET() {
  const id = await session()
  if (!id) return NextResponse.json({ error: 'נדרשת כניסה' }, { status: 401 })
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { data: rows } = await db.from('gilyonot_distributors').select('id, full_name, city, address, synagogue, quantity')
    .eq('status', 'active').or(identityFilter(id)).order('created_at').limit(50)
  const ids = (rows ?? []).map(r => r.id)
  const { data: events } = ids.length
    ? await db.from('gilyonot_distributor_events').select('id, distributor_id, kind, quantity, details, status, created_at')
      .in('distributor_id', ids).neq('kind', 'admin_edit').order('created_at', { ascending: false }).limit(30)
    : { data: [] }
  return NextResponse.json({ distributors: rows ?? [], events: events ?? [] })
}

// POST { distributorId, action, quantity?, details?, address?, city? }
export async function POST(request: Request) {
  const id = await session()
  if (!id) return NextResponse.json({ error: 'נדרשת כניסה' }, { status: 401 })
  if (!rateLimit(`mefitz-action:${loginKey(id)}`, 20, 60 * 60_000)) {
    return NextResponse.json({ error: 'נשלחו יותר מדי פניות. נסו שוב מאוחר יותר.' }, { status: 429 })
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const distributorId = typeof body?.distributorId === 'string' && UUID_RE.test(body.distributorId) ? body.distributorId : null
  if (!body || !distributorId) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  // ⚠️ השורה חייבת להיות של המפיץ המחובר
  const { data: own } = await db.from('gilyonot_distributors').select('id').eq('id', distributorId).eq('status', 'active').or(identityFilter(id)).maybeSingle()
  if (!own) return NextResponse.json({ error: 'אין גישה' }, { status: 403 })

  const res = await runDistributorAction(db, distributorId, body.action, body, 'web')
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json({ ok: true, message: res.message })
}
