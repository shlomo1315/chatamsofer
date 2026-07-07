import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceOrAnonClient as getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }

const VALID_STAFF_ROLES = ['admin', 'secretary', 'reviewer', 'collections']

// מאמת שמי שמבצע את הפעולה מחובר, פעיל, ובעל תפקיד צוות תקין —
// לא רק "מחובר לאיזשהו חשבון auth". ללא בדיקה זו, כל session תקין
// (שניתן ליצור ישירות מול Supabase עם ה-anon key) יכול לשנות את עץ הדורות.
async function verifyStaff() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { /* server component */ }
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.is_active === false) return false
  return VALID_STAFF_ROLES.includes(profile.role)
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
  const isStaff = await verifyStaff()
  if (!isStaff) return NextResponse.json({ error: 'לא מורשה' }, { status: 403 })

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
  const isStaff = await verifyStaff()
  if (!isStaff) return NextResponse.json({ error: 'לא מורשה' }, { status: 403 })

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
    if (!['verified', 'pending'].includes(body.status)) {
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
    // אוספים את כל הצאצאים לפי הדור החדש שלהם, ואז מבצעים UPDATE אחד לכל דור
    // (מספר בודד של שאילתות) במקום UPDATE נפרד לכל צומת בלולאה סדרתית.
    const byGeneration = new Map<number, string[]>()
    const queue: { id: string; gen: number }[] = []
    for (const c of childrenOf.get(id) ?? []) queue.push({ id: c, gen: baseGen + 1 })
    while (queue.length) {
      const item = queue.shift() as { id: string; gen: number }
      const arr = byGeneration.get(item.gen) ?? []
      arr.push(item.id)
      byGeneration.set(item.gen, arr)
      for (const c of childrenOf.get(item.id) ?? []) queue.push({ id: c, gen: item.gen + 1 })
    }
    await Promise.all(
      [...byGeneration.entries()].map(([gen, ids]) =>
        admin.from('lineage_nodes').update({ generation: gen }).in('id', ids)
      )
    )
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
  const isStaff = await verifyStaff()
  if (!isStaff) return NextResponse.json({ error: 'לא מורשה' }, { status: 403 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'חסר ID' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const { error } = await admin.from('lineage_nodes').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
