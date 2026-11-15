import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { cleanTranscript } from '@/lib/kvitelView'

// שמירת תמלול להקלטה של בקשת קוויטל שהגיעה בטלפון (השורה המורחבת ברשימה).
// PUT { id, text, approve? } — הטקסט נשמר ב-raw_text; approve מעביר מ"לבדיקה" ל"טרם נשלח".
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
  const text = cleanTranscript(body.text ?? '')
  if (!id) return NextResponse.json({ error: 'מזהה בקשה לא תקין' }, { status: 400 })
  if (text === undefined) return NextResponse.json({ error: 'התמלול ארוך מדי' }, { status: 400 })

  const { data: row } = await db.from('kvitel_requests').select('id, recording_url, status').eq('id', id).maybeSingle()
  if (!row?.recording_url) return NextResponse.json({ error: 'לבקשה אין הקלטה' }, { status: 400 })

  const update: Record<string, unknown> = { raw_text: text }
  if (body.approve === true && row.status === 'review') update.status = 'pending'
  const { error } = await db.from('kvitel_requests').update(update).eq('id', id)
  if (error) {
    console.error('[kvitel] transcript save failed:', error)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }
  await logActivity(db, {
    userId: staff.userId, action: 'kvitel_transcript', entityType: 'kvitel_request', entityId: id,
    details: { approved: update.status === 'pending' },
  })
  return NextResponse.json({ ok: true })
}
