import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { message_id, thread_id, event_type, user_id, label_ids, from_email, subject } = body

  if (!message_id || !event_type) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const client = getClient()
  if (!client) return NextResponse.json({ error: 'server error' }, { status: 500 })

  // Avoid duplicate 'read' events for the same message
  if (event_type === 'read') {
    const { data: existing } = await client
      .from('mail_events')
      .select('id')
      .eq('message_id', message_id)
      .eq('event_type', 'read')
      .limit(1)
    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, skipped: true })
    }
  }

  const { error } = await client.from('mail_events').insert({
    message_id,
    thread_id: thread_id ?? '',
    event_type,
    user_id: user_id ?? null,
    label_ids: label_ids ?? [],
    from_email: from_email ?? '',
    subject: subject ?? '',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
