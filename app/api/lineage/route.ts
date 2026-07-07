import { NextResponse, type NextRequest } from 'next/server'
import { createServiceOrAnonClient as getClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

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
