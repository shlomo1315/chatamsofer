import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const parentId = request.nextUrl.searchParams.get('parent_id')
  const all = request.nextUrl.searchParams.get('all')

  const client = getClient()
  if (!client) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let query = client
    .from('lineage_nodes')
    .select('*')
    .eq('status', 'verified')
    .order('generation')
    .order('name')

  if (all === '1') {
    // return all verified nodes
  } else if (parentId) {
    query = query.eq('parent_id', parentId)
  } else {
    query = query.is('parent_id', null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ nodes: data ?? [] })
}
