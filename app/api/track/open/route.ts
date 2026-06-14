import { type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// 1×1 transparent GIF
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t')

  if (token) {
    const client = getClient()
    if (client) {
      // Increment open count and set opened_at on first open
      client
        .from('email_tracking')
        .select('open_count, opened_at')
        .eq('token', token)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return
          client
            .from('email_tracking')
            .update({
              open_count: (data.open_count ?? 0) + 1,
              opened_at: data.opened_at ?? new Date().toISOString(),
            })
            .eq('token', token)
            .then(() => {})
        })
    }
  }

  return new Response(GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
    },
  })
}
