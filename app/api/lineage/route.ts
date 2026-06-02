import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const parentId = request.nextUrl.searchParams.get('parent_id')
  const all = request.nextUrl.searchParams.get('all')

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let query = admin.from('lineage_nodes').select('*').order('generation').order('name')

  if (all === '1') {
    // return all nodes (for tree view)
  } else if (parentId) {
    query = query.eq('parent_id', parentId)
  } else {
    query = query.is('parent_id', null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ nodes: data ?? [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { name, parent_id } = body

  if (!name?.trim()) return NextResponse.json({ error: 'שם הוא שדה חובה' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let generation = 0
  if (parent_id) {
    const { data: parent } = await admin
      .from('lineage_nodes').select('generation').eq('id', parent_id).single()
    if (parent) generation = (parent.generation ?? 0) + 1
  }

  const { data, error } = await admin
    .from('lineage_nodes')
    .insert({ name: name.trim(), parent_id: parent_id ?? null, generation })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ node: data })
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'חסר id' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const { name } = body
  if (!name?.trim()) return NextResponse.json({ error: 'שם הוא שדה חובה' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await admin
    .from('lineage_nodes').update({ name: name.trim() }).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ node: data })
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'חסר id' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { error } = await admin.from('lineage_nodes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
