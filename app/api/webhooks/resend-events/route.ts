import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { addUnsubscribe } from '@/lib/unsubscribe'
import { verifySvixSignature } from '@/lib/svix'

// ─────────────────────────────────────────────────────────────────────────────
// Webhook לאירועי מסירה של Resend — delivered / opened / clicked / bounced /
// complained. מזהה את המייל לפי resend_id ומעדכן את הנמען + טבלת האירועים.
//
// אבטחה: Resend חותם עם Svix. בלי אימות חתימה, כל אחד יכול לזייף
// "1,000 פתיחות" או להסיר אנשים מרשימת התפוצה. נכשל-סגור.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// מיפוי סוג האירוע → העמודה שמתעדכנת אצל הנמען
const EVENT_COLUMN: Record<string, string> = {
  'email.delivered': 'delivered_at',
  'email.opened': 'opened_at',
  'email.clicked': 'clicked_at',
  'email.bounced': 'bounced_at',
  'email.complained': 'complained_at',
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // נכשל-סגור: בלי סוד, הכל נדחה
  const secret = process.env.RESEND_WEBHOOK_SIGNING_SECRET
  if (!secret) {
    console.error('[resend-events] RESEND_WEBHOOK_SIGNING_SECRET חסר — דחיית כל הבקשות')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!verifySvixSignature(request, rawBody, secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let payload: { type?: string; data?: Record<string, unknown> }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  const type = String(payload.type ?? '')
  const data = payload.data ?? {}
  const resendId = String(data.email_id ?? '')

  if (!resendId) return NextResponse.json({ ok: true, skipped: 'no email_id' })

  const db = admin()
  if (!db) return NextResponse.json({ error: 'server' }, { status: 500 })

  // איתור הנמען לפי מזהה Resend
  const { data: recipient } = await db
    .from('campaign_recipients')
    .select('id, email, campaign_id, beneficiary_id, open_count, click_count')
    .eq('resend_id', resendId)
    .maybeSingle()

  const linkUrl = type === 'email.clicked'
    ? String((data.click as Record<string, unknown> | undefined)?.link ?? '')
    : null

  // תיעוד האירוע הגולמי — audit trail מלא
  await db.from('email_events').insert({
    resend_id: resendId,
    recipient_id: recipient?.id ?? null,
    event_type: type.replace(/^email\./, ''),
    link_url: linkUrl,
    user_agent: String((data.click as Record<string, unknown> | undefined)?.userAgent ?? '') || null,
    raw: data,
  })

  if (recipient) {
    const column = EVENT_COLUMN[type]
    if (column) {
      const patch: Record<string, unknown> = { [column]: new Date().toISOString() }

      // מונים — פתיחה/קליק יכולים לקרות כמה פעמים
      if (type === 'email.opened') patch.open_count = (recipient.open_count ?? 0) + 1
      if (type === 'email.clicked') patch.click_count = (recipient.click_count ?? 0) + 1

      await db.from('campaign_recipients').update(patch).eq('id', recipient.id)
    }

    // ── הגנה על בריאות הדומיין ──
    // כתובת שנכשלה (hard bounce) או שסימנה אותנו כספאם — מוסרת אוטומטית.
    // שליחה חוזרת אליה תהרוס את המוניטין מול Gmail ותעביר את *כל* המיילים
    // שלנו לספאם, כולל האוטומטיים.
    if (type === 'email.bounced' || type === 'email.complained') {
      const bounceType = String((data.bounce as Record<string, unknown> | undefined)?.type ?? '')
      const isHard = type === 'email.complained' || bounceType.toLowerCase() === 'hard'
      if (isHard) {
        await addUnsubscribe(
          db,
          recipient.email,
          type === 'email.complained' ? 'complaint' : 'bounce',
          recipient.campaign_id,
          recipient.beneficiary_id,
        )
      }
    }
  }

  return NextResponse.json({ ok: true })
}
