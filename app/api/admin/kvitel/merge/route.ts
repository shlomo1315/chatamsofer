import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { MERGE_MAX, planMerge } from '@/lib/kvitelDuplicates'
import type { KvitelRequestRow } from '@/lib/kvitelQuery'

// מיזוג ידני של שמות כפולים (הלוח "שמות כפולים" ב-app/admin/kvitel).
// POST { keepId, mergeIds[] } — מזהי שורות. השורה keepId נשארת עם כל הבקשות של כולן, השאר נמחקות.
// בקשה שנשארה בלי שמות מבוטלת. כל מה שנמחק נשמר ביומן הפעולות (kvitel_merge) לשחזור.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SELECT = 'id, channel, status, contact_name, contact_phone, contact_email, raw_text, recording_url, note, submitted_at, done_at, kvitel_request_lines(id, position, name, relation, parent_name, request_type, request_note, flagged, flag_reason)'

export async function POST(request: NextRequest) {
  const staff = await requirePermission('kvitel', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown> | null = null
  try { body = await request.json() } catch { /* נבדק מיד */ }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 })
  const keepId = typeof body.keepId === 'string' && UUID_RE.test(body.keepId) ? body.keepId : null
  const mergeIds = Array.isArray(body.mergeIds) && body.mergeIds.length <= MERGE_MAX && body.mergeIds.every(x => typeof x === 'string' && UUID_RE.test(x))
    ? body.mergeIds as string[] : null
  if (!keepId || !mergeIds) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const lineIds = [keepId, ...mergeIds]
  const { data: lines, error: lErr } = await db.from('kvitel_request_lines').select('id, request_id').in('id', lineIds)
  if (lErr) return NextResponse.json({ error: 'הטעינה נכשלה' }, { status: 500 })
  const reqIds = [...new Set((lines ?? []).map(l => l.request_id as string))]
  const { data: rows, error: rErr } = reqIds.length
    ? await db.from('kvitel_requests').select(SELECT).in('id', reqIds)
    : { data: [], error: null }
  if (rErr) return NextResponse.json({ error: 'הטעינה נכשלה' }, { status: 500 })

  const plan = planMerge((rows ?? []) as unknown as KvitelRequestRow[], keepId, mergeIds)
  if ('error' in plan) return NextResponse.json({ error: plan.error }, { status: 400 })

  // קודם מעדכנים את השורה שנשארת (עם כל הבקשות), ורק אחר כך מוחקים — כשל באמצע לא מאבד בקשה.
  const { error: uErr } = await db.from('kvitel_request_lines')
    .update({ request_type: plan.keep.request_type, request_note: plan.keep.request_note }).eq('id', plan.keep.id)
  if (uErr) {
    console.error('[kvitel] merge keep update failed:', uErr)
    return NextResponse.json({ error: 'המיזוג נכשל' }, { status: 500 })
  }
  const { error: dErr } = await db.from('kvitel_request_lines').delete().in('id', plan.deleteIds)
  if (dErr) {
    console.error('[kvitel] merge delete failed:', dErr)
    return NextResponse.json({ error: 'המיזוג נכשל' }, { status: 500 })
  }
  for (const r of plan.requests) {
    const { error } = await db.from('kvitel_requests').update(r.cancel ? { note: r.note, status: 'cancelled' } : { note: r.note }).eq('id', r.id)
    if (error) console.error('[kvitel] merge request note failed:', error)
  }

  await logActivity(db, {
    userId: staff.userId, action: 'kvitel_merge', entityType: 'kvitel_request_line', entityId: plan.keep.id,
    details: { keep: plan.keep, removed: plan.removed, cancelled: plan.requests.filter(r => r.cancel).map(r => r.id) },
  })
  return NextResponse.json({ ok: true, merged: plan.deleteIds.length, cancelled: plan.requests.filter(r => r.cancel).length })
}
