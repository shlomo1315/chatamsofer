import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { name, parent_id, relation } = body
  const rel = relation === 'son' || relation === 'son_in_law' ? relation : null
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'שם הצומת הוא שדה חובה' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let generation = 1
  if (parent_id) {
    const { data: parent } = await admin
      .from('lineage_nodes')
      .select('generation')
      .eq('id', parent_id)
      .maybeSingle()
    if (parent) generation = parent.generation + 1
  }

  const { data, error } = await admin
    .from('lineage_nodes')
    .insert({
      name: name.trim(),
      parent_id: parent_id || null,
      generation,
      relation: rel,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, node: data })
}
