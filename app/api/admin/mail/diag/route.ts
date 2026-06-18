import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// אבחון מצב מערכת המייל: בודק שהטבלאות קיימות, סופר שורות,
// ומחזיר את ההגדרות הסביבתיות (ללא חשיפת ערכים סודיים).
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = {
    SUPABASE_URL: !!url,
    SUPABASE_SERVICE_ROLE_KEY: !!key,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
  }

  if (!url || !key) {
    return NextResponse.json({ env, error: 'missing supabase env vars' })
  }

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const inbound = await admin.from('inbound_emails').select('id', { count: 'exact', head: true })
  const sent = await admin.from('sent_emails').select('id', { count: 'exact', head: true })

  // דגימת השורות האחרונות + אורך הגוף (לאבחון מיילים שמגיעים "ריקים")
  const lastInbound = await admin
    .from('inbound_emails')
    .select('from_email,to_email,subject,received_at,is_read,html,plain_text,attachments')
    .order('received_at', { ascending: false })
    .limit(5)
  const lastSent = await admin
    .from('sent_emails')
    .select('to_email,subject,department,sent_at')
    .order('sent_at', { ascending: false })
    .limit(5)

  // אבחון: ה-payload האחרון שהגיע ל-webhook הנכנס (כדי לאתר היכן נמצא גוף ההודעה)
  let lastPayload: unknown = null
  try {
    const { data: p } = await admin.from('app_settings').select('value').eq('key', 'mail_inbound_last_payload').maybeSingle()
    if (p?.value) { try { lastPayload = JSON.parse(p.value) } catch { lastPayload = p.value } }
  } catch { /* ignore */ }

  return NextResponse.json({
    env,
    inbound: {
      tableExists: !inbound.error,
      error: inbound.error?.message ?? null,
      count: inbound.count ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      last: (lastInbound.data ?? []).map((m: any) => ({
        from_email: m.from_email,
        to_email: m.to_email,
        subject: m.subject,
        received_at: m.received_at,
        is_read: m.is_read,
        html_len: (m.html ?? '').length,
        text_len: (m.plain_text ?? '').length,
        attachments: Array.isArray(m.attachments) ? m.attachments.length : 0,
      })),
    },
    lastInboundPayload: lastPayload,
    sent: {
      tableExists: !sent.error,
      error: sent.error?.message ?? null,
      count: sent.count ?? 0,
      last: lastSent.data ?? [],
    },
  })
}
