import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }

// Prefer the service-role key (full access for writes); fall back to the public
// anon key so reads still work even if the service key isn't configured on the host.
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function verifyStaff() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500, headers: NO_STORE })

  const { data, error } = await admin
    .from('lineage_nodes')
    .select('*')
    .order('generation')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE })
  return NextResponse.json({ nodes: data ?? [] }, { headers: NO_STORE })
}

export async function POST(request: NextRequest) {
  const user = await verifyStaff()
  if (!user) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  const body = await request.json()
  const { name, parent_id, notes } = body

  if (!name?.trim()) return NextResponse.json({ error: 'שם חובה' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  let generation = 1
  if (parent_id) {
    const { data: parent } = await admin
      .from('lineage_nodes')
      .select('generation')
      .eq('id', parent_id)
      .single()
    if (parent) generation = parent.generation + 1
  }

  // כל צומת חדש שנוסף — ברירת מחדל "ממתין לאימות" (כתום), עד שמסמנים אותו כירוק
  const { data, error } = await admin.from('lineage_nodes').insert({
    name: name.trim(),
    parent_id: parent_id || null,
    generation,
    notes: notes?.trim() || null,
    status: 'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ node: data })
}

export async function PATCH(request: NextRequest) {
  const user = await verifyStaff()
  if (!user) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  const body = await request.json()
  const { id, name, notes, parent_id } = body

  if (!id) return NextResponse.json({ error: 'חסר ID' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) {
    if (!name.trim()) return NextResponse.json({ error: 'שם חובה' }, { status: 400 })
    updates.name = name.trim()
  }
  if (notes !== undefined) updates.notes = notes?.trim() || null
  if (body.status !== undefined) {
    if (!['verified', 'pending', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 })
    }
    updates.status = body.status
  }

  if (parent_id !== undefined) {
    const newParent: string | null = parent_id || null
    if (newParent === id) {
      return NextResponse.json({ error: 'לא ניתן להפוך צומת להורה של עצמו' }, { status: 400 })
    }
    const { data: all, error: allErr } = await admin
      .from('lineage_nodes')
      .select('id, parent_id, generation')
    if (allErr) return NextResponse.json({ error: allErr.message }, { status: 500 })
    const list = all ?? []
    const childrenOf = new Map<string | null, string[]>()
    for (const n of list) {
      const arr = childrenOf.get(n.parent_id) ?? []
      arr.push(n.id)
      childrenOf.set(n.parent_id, arr)
    }
    const subtree = new Set<string>()
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop() as string
      subtree.add(cur)
      for (const c of childrenOf.get(cur) ?? []) stack.push(c)
    }
    if (newParent && subtree.has(newParent)) {
      return NextResponse.json({ error: 'לא ניתן להעביר צומת אל תוך הצאצאים שלו' }, { status: 400 })
    }
    let baseGen = 1
    if (newParent) {
      const p = list.find((n) => n.id === newParent)
      baseGen = (p?.generation ?? 0) + 1
    }
    updates.parent_id = newParent
    updates.generation = baseGen
    const queue: { id: string; gen: number }[] = []
    for (const c of childrenOf.get(id) ?? []) queue.push({ id: c, gen: baseGen + 1 })
    while (queue.length) {
      const item = queue.shift() as { id: string; gen: number }
      await admin.from('lineage_nodes').update({ generation: item.gen }).eq('id', item.id)
      for (const c of childrenOf.get(item.id) ?? []) queue.push({ id: c, gen: item.gen + 1 })
    }
  }

  const { data, error } = await admin
    .from('lineage_nodes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ node: data })
}

export async function DELETE(request: NextRequest) {
  const user = await verifyStaff()
  if (!user) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'חסר ID' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const { error } = await admin.from('lineage_nodes').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
