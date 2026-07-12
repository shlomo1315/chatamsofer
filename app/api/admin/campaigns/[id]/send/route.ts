import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'
import { resolveSegment, type SegmentDef } from '@/lib/newsletter/segments'
import { runCampaignSender } from '@/lib/newsletter/sender'
import { nextAllowedSendTime } from '@/lib/jewishCalendar'

// מימוש הקהל והפעלת השליחה.
//
// המימוש (materialize) הופך את הסגמנט לשורות בטבלה — הקהל "מוקפא" ברגע
// השליחה, כך שאם רשומה משתנה או נמחקת באמצע, הקמפיין לא נשבר.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const INSERT_CHUNK = 500

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // תזמון למועד עתידי (אופציונלי)
  let scheduledAt: string | null = null
  try {
    const body = await request.json()
    if (body?.scheduledAt) scheduledAt = String(body.scheduledAt)
  } catch { /* גוף ריק — שליחה מיידית */ }

  const { data: campaign } = await db
    .from('campaigns')
    .select('id, name, subject, status, segment, content, content_mode, raw_html')
    .eq('id', id)
    .maybeSingle()

  if (!campaign) return NextResponse.json({ error: 'הקמפיין לא נמצא' }, { status: 404 })
  if (['sending', 'sent'].includes(campaign.status)) {
    return NextResponse.json({ error: 'הקמפיין כבר נשלח' }, { status: 400 })
  }
  if (!campaign.subject?.trim()) {
    return NextResponse.json({ error: 'חסרה שורת נושא' }, { status: 400 })
  }

  const hasContent = campaign.content_mode === 'html'
    ? Boolean(campaign.raw_html?.trim())
    : Array.isArray(campaign.content) && campaign.content.length > 0
  if (!hasContent) {
    return NextResponse.json({ error: 'הקמפיין ריק — אין תוכן לשליחה' }, { status: 400 })
  }

  // ── מימוש הקהל ──
  const { recipients, stats } = await resolveSegment(db, (campaign.segment ?? {}) as SegmentDef)

  if (!recipients.length) {
    return NextResponse.json({ error: 'אין נמענים בקהל שנבחר' }, { status: 400 })
  }

  // ── תזמון למועד עתידי ──
  // הקהל לא מומש עכשיו — הוא ימומש ברגע השליחה בפועל, כך שהוא ישקף
  // את מצב המערכת באותו רגע (מוטבים שנוספו/הוסרו בינתיים).
  if (scheduledAt) {
    const when = new Date(scheduledAt)
    if (isNaN(when.getTime())) {
      return NextResponse.json({ error: 'מועד לא תקין' }, { status: 400 })
    }
    if (when.getTime() < Date.now()) {
      return NextResponse.json({ error: 'המועד שנבחר כבר עבר' }, { status: 400 })
    }

    // המערכת לעולם לא שולחת בשבת או בחג — המועד נדחה ליום החול הבא, 09:00
    const allowed = nextAllowedSendTime(when)
    const moved = allowed.getTime() !== when.getTime()

    const { error } = await db.from('campaigns').update({
      status: 'scheduled',
      scheduled_at: allowed.toISOString(),
      total_count: recipients.length,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      scheduled: true,
      scheduledAt: allowed.toISOString(),
      moved,   // הלקוח מציג הודעה אם המועד נדחה בגלל שבת/חג
      total: recipients.length,
    })
  }

  // ניקוי מימוש קודם (אם נשלח בעבר וחזר לטיוטה)
  await db.from('campaign_recipients').delete().eq('campaign_id', id)

  // הכנסה במנות — 5,000 שורות בבקשה אחת יקרסו
  for (let i = 0; i < recipients.length; i += INSERT_CHUNK) {
    const chunk = recipients.slice(i, i + INSERT_CHUNK).map(r => ({
      campaign_id: id,
      beneficiary_id: r.beneficiaryId,
      email: r.email,
      merge_data: r.mergeData,
      status: 'pending',
    }))
    const { error } = await db.from('campaign_recipients')
      .upsert(chunk, { onConflict: 'campaign_id,email', ignoreDuplicates: true })
    if (error) {
      console.error('[newsletter] מימוש הקהל נכשל:', error.message)
      return NextResponse.json({ error: 'מימוש הקהל נכשל' }, { status: 500 })
    }
  }

  // ── הפעלת השליחה ──
  const { error: upErr } = await db.from('campaigns').update({
    status: 'sending',
    started_at: new Date().toISOString(),
    total_count: recipients.length,
    sent_count: 0,
    failed_count: 0,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // התחלה מיידית ברקע — לא ממתינים ל-worker השעתי.
  // ה-worker ימשיך משם בטיקים הבאים.
  void runCampaignSender().catch(e => console.error('[newsletter] הפעלה ראשונית נכשלה:', e))

  return NextResponse.json({
    ok: true,
    total: recipients.length,
    noEmail: stats.noEmail,
    suppressed: stats.suppressed,
  })
}
