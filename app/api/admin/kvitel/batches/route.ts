import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { loadKvitelRequests, parseKvitelFilters } from '@/lib/kvitelQuery'
import { kvitelBatch } from '@/lib/kvitelWeek'

// מנות שבועיות של קוויטלאך (app/admin/kvitel/KvitelWeek.tsx, טבלת kvitel_batches).
// GET  — המנות האחרונות, בלי השורות עצמן (נטפרי חוסם דף עם שמות גלויים).
// POST { ids, parsha } — סגירת מנה אחרי שהקובץ ירד: רושם את השורות כפי שירדו ומסמן "נשלח לציון".
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 500
const LIST_LIMIT = 20
// הטבלה עוד לא נוצרה במסד (המיגרציה 20261119_kvitel_batches.sql)
const isMissingTable = (e: { code?: string } | null) => e?.code === '42P01' || e?.code === 'PGRST205'

export async function GET() {
  const staff = await requirePermission('kvitel', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { data, error } = await db.from('kvitel_batches')
    .select('id, closed_at, closed_by_name, parsha, request_count, name_count')
    .order('closed_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (isMissingTable(error)) return NextResponse.json({ batches: [], missing: true })
  if (error) {
    console.error('[kvitel] batches load failed:', error)
    return NextResponse.json({ error: 'טעינת המנות נכשלה' }, { status: 500 })
  }
  return NextResponse.json({ batches: data ?? [] })
}

export async function POST(req: NextRequest) {
  const staff = await requirePermission('kvitel', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const body = await req.json().catch(() => null) as { ids?: unknown; parsha?: unknown } | null
  const ids = Array.isArray(body?.ids) ? body.ids : null
  if (!ids || !ids.length || ids.length > MAX_IDS || !ids.every((i): i is string => typeof i === 'string' && UUID_RE.test(i))) {
    return NextResponse.json({ error: 'רשימת מזהים לא תקינה' }, { status: 400 })
  }
  const parsha = typeof body?.parsha === 'string' ? body.parsha.trim().slice(0, 40) || null : null

  // רק מה שעדיין "לא נשלח" — בקשה שהוחזרה לבדיקה או כבר נשלחה בינתיים לא נרשמת פעמיים
  const { rows, error: loadError } = await loadKvitelRequests(db, parseKvitelFilters({ status: 'pending' }))
  if (loadError) return NextResponse.json({ error: 'טעינת הבקשות נכשלה' }, { status: 500 })
  const batch = kvitelBatch(rows, ids)
  if (!batch.ids.length) return NextResponse.json({ error: 'אין בקשות לסגירה' }, { status: 404 })

  const { data: rec, error: insError } = await db.from('kvitel_batches').insert({
    closed_by: staff.userId, closed_by_name: staff.email, parsha,
    request_ids: batch.ids, lines: batch.lines, request_count: batch.ids.length, name_count: batch.lines.length,
  }).select('id').single()
  // בלי הטבלה הסגירה עדיין מסמנת "נשלח" כמו קודם — רק בלי הורדה חוזרת
  if (insError && !isMissingTable(insError)) {
    console.error('[kvitel] batch insert failed:', insError)
    return NextResponse.json({ error: 'רישום המנה נכשל' }, { status: 500 })
  }

  const now = new Date().toISOString()
  const { data, error } = await db.from('kvitel_requests')
    .update({ status: 'done', done_at: now, done_by: staff.userId })
    .in('id', batch.ids)
    .eq('status', 'pending')
    .select('id')
  if (error) {
    console.error('[kvitel] batch status update failed:', error)
    return NextResponse.json({ error: 'הסימון "נשלח לציון" נכשל' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'kvitel_batch_close', entityType: 'kvitel_batch', entityId: rec?.id ?? null,
    details: { parsha, requests: batch.ids.length, names: batch.lines.length, recorded: !!rec },
  })
  return NextResponse.json({ ok: true, id: rec?.id ?? null, recorded: !!rec, updated: data?.length ?? 0, names: batch.lines.length })
}
