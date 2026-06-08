import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('messageIds') ?? ''
  const messageIds = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (!messageIds.length) return NextResponse.json({})

  const client = getClient()
  if (!client) return NextResponse.json({})

  const { data } = await client
    .from('email_tracking')
    .select('gmail_msg_id, opened_at, open_count')
    .in('gmail_msg_id', messageIds)

  const result: Record<string, { opened: boolean; openedAt: string | null; openCount: number }> = {}
  for (const row of data ?? []) {
    result[row.gmail_msg_id] = {
      opened: !!row.opened_at,
      openedAt: row.opened_at,
      openCount: row.open_count ?? 0,
    }
  }
  return NextResponse.json(result)
}
