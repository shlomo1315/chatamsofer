import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { ensureAnnouncement, announcementToken } from '@/lib/creditsAnnouncement'
import {
  VOICE_BROADCAST_KEY, VOICE_BROADCAST_STATUSES, VOICE_FULL_WINDOW_MS, VOICE_TEST_PHONE, VOICE_TEST_WINDOW_MS,
  dialVoiceBroadcast, pickVoiceRecipients, type VoiceMarker,
} from '@/lib/voiceBroadcast'

// הודעה קולית לכל מי שרכש ביריד (חשבון ימות של היריד בלבד).
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api.
//   GET                     -> ספירה בלבד
//   POST {test:true}        -> חיוג ל-0527101315 בלבד
//   POST {confirm:<ספירה>}  -> חיוג לכולם; חייב להתאים לספירה העדכנית
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const STARTED = 'book_fair_voice_broadcast_started'
const DONE = 'book_fair_voice_broadcast_done'

async function loadRecipients(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { rows } = await fetchAllRows<{ customer_phone: string | null; status: string }>(
    (from, to) => db.from('book_fair_orders')
      .select('customer_phone, status')
      .in('status', VOICE_BROADCAST_STATUSES)
      .not('customer_phone', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: { customer_phone: string | null; status: string }[] | null; error: { message: string } | null }>
  )
  return pickVoiceRecipients(rows)
}

async function setMarker(db: NonNullable<ReturnType<typeof getServiceClient>>, m: VoiceMarker) {
  await db.from('app_settings').upsert(
    { key: VOICE_BROADCAST_KEY, value: JSON.stringify(m), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}

export async function GET() {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const recipients = await loadRecipients(db)
  const { count } = await db.from('activity_log').select('id', { count: 'exact', head: true }).eq('action', STARTED)
  const { data: last } = await db.from('activity_log').select('details, created_at').eq('action', DONE).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return NextResponse.json({ count: recipients.length, alreadyStarted: (count ?? 0) > 0, last: last ? { ...(last.details as object), at: last.created_at } : null })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => null) as { test?: boolean; confirm?: number; again?: boolean } | null

  // ההקלטה חייבת להיות מוכנה לפני החיוג, אחרת השיחה שקטה
  await ensureAnnouncement()
  if (!(await announcementToken())) {
    return NextResponse.json({ error: 'ההקלטה לא מוכנה (בדקו שהקול של ElevenLabs מוגדר). לא חויג אף מספר' }, { status: 500 })
  }

  if (body?.test) {
    await setMarker(db, { until: new Date(Date.now() + VOICE_TEST_WINDOW_MS).toISOString(), phones: [VOICE_TEST_PHONE] })
    const res = await dialVoiceBroadcast([VOICE_TEST_PHONE])
    return res.ok ? NextResponse.json({ ok: true, test: true }) : NextResponse.json({ error: res.error ?? 'החיוג נכשל' }, { status: 500 })
  }

  const recipients = await loadRecipients(db)
  if (body?.confirm !== recipients.length || !recipients.length) {
    return NextResponse.json({ error: 'נדרש אישור עם הספירה העדכנית', count: recipients.length }, { status: 400 })
  }
  const { count: started } = await db.from('activity_log').select('id', { count: 'exact', head: true }).eq('action', STARTED)
  if ((started ?? 0) > 0 && !body?.again) {
    return NextResponse.json({ error: 'השליחה המלאה כבר התחילה. לשליחה חוזרת יש לשלוח again:true' }, { status: 409 })
  }
  await logActivity(db, { userId: staff.userId, action: STARTED, entityType: 'book_fair_orders', details: { total: recipients.length } })
  await setMarker(db, { until: new Date(Date.now() + VOICE_FULL_WINDOW_MS).toISOString(), phones: 'all' })
  const res = await dialVoiceBroadcast(recipients)
  await logActivity(db, { userId: staff.userId, action: DONE, entityType: 'book_fair_orders', details: { total: recipients.length, dialed: res.dialed, error: res.error ?? null } })
  return res.ok
    ? NextResponse.json({ ok: true, total: recipients.length, dialed: res.dialed })
    : NextResponse.json({ error: res.error ?? 'החיוג נכשל', dialed: res.dialed }, { status: 500 })
}
