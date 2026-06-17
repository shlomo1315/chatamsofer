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

  // דגימת השורות האחרונות (מטא-דאטה בלבד)
  const lastInbound = await admin
    .from('inbound_emails')
    .select('from_email,to_email,subject,received_at,is_read')
    .order('received_at', { ascending: false })
    .limit(5)
  const lastSent = await admin
    .from('sent_emails')
    .select('to_email,subject,department,sent_at')
    .order('sent_at', { ascending: false })
    .limit(5)

  return NextResponse.json({
    env,
    inbound: {
      tableExists: !inbound.error,
      error: inbound.error?.message ?? null,
      count: inbound.count ?? 0,
      last: lastInbound.data ?? [],
    },
    sent: {
      tableExists: !sent.error,
      error: sent.error?.message ?? null,
      count: sent.count ?? 0,
      last: lastSent.data ?? [],
    },
  })
}
