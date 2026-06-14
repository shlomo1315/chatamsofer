import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// מיזוג צמתים כפולים: כל ה-mergeIds מתמזגים אל keepId.
// ילדיהם והנרשמים המשויכים אליהם עוברים ל-keepId, והכפילים נמחקים.
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  let body: { keepId?: string; mergeIds?: string[] }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const keepId = body.keepId
  const mergeIds = Array.from(new Set((body.mergeIds ?? []).filter(Boolean)))
  if (!keepId) return NextResponse.json({ error: 'חסר צומת יעד (keepId)' }, { status: 400 })
  if (!mergeIds.length) return NextResponse.json({ error: 'יש לבחור לפחות צומת אחד למיזוג' }, { status: 400 })
  if (mergeIds.includes(keepId)) return NextResponse.json({ error: 'צומת היעד לא יכול להיות גם צומת למיזוג' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  // טעינת כל הצמתים (id, parent_id, generation) לאימות וחישוב דורות
  const { data: all, error: allErr } = await admin.from('lineage_nodes').select('id, parent_id, generation')
  if (allErr) return NextResponse.json({ error: allErr.message }, { status: 500 })
  const list = all ?? []
  const byId = new Map(list.map(n => [n.id, n]))

  const keep = byId.get(keepId)
  if (!keep) return NextResponse.json({ error: 'צומת היעד לא נמצא' }, { status: 404 })
  for (const mid of mergeIds) if (!byId.has(mid)) return NextResponse.json({ error: 'אחד הצמתים למיזוג לא נמצא' }, { status: 404 })

  // מניעת מעגל: אף צומת למיזוג אינו אב-קדמון של keepId
  const ancestors = new Set<string>()
  let cur: string | null | undefined = keep.parent_id
  let guard = 0
  while (cur && guard < 100) { ancestors.add(cur); cur = byId.get(cur)?.parent_id ?? null; guard++ }
  for (const mid of mergeIds) {
    if (ancestors.has(mid)) {
      return NextResponse.json({ error: 'לא ניתן למזג צומת שהוא אב-קדמון של צומת היעד' }, { status: 400 })
    }
  }

  let reassignedChildren = 0
  let reassignedBeneficiaries = 0

  for (const mid of mergeIds) {
    // 1) העברת ילדי הכפיל אל keep
    const { data: kids } = await admin.from('lineage_nodes').update({ parent_id: keepId }).eq('parent_id', mid).select('id')
    reassignedChildren += kids?.length ?? 0
    // 2) העברת נרשמים המשויכים לכפיל אל keep
    const { data: bens } = await admin.from('beneficiaries').update({ lineage_node_id: keepId }).eq('lineage_node_id', mid).select('id')
    reassignedBeneficiaries += bens?.length ?? 0
    // 3) מחיקת הכפיל
    await admin.from('lineage_nodes').delete().eq('id', mid)
  }

  // חישוב-מחדש דורות לכל תת-העץ של keep (אחרי שהילדים עברו)
  const { data: fresh } = await admin.from('lineage_nodes').select('id, parent_id')
  const childrenOf = new Map<string | null, string[]>()
  for (const n of fresh ?? []) {
    const arr = childrenOf.get(n.parent_id) ?? []
    arr.push(n.id)
    childrenOf.set(n.parent_id, arr)
  }
  const queue: { id: string; gen: number }[] = []
  for (const c of childrenOf.get(keepId) ?? []) queue.push({ id: c, gen: (keep.generation ?? 1) + 1 })
  let g = 0
  while (queue.length && g < 100000) {
    const item = queue.shift()!
    await admin.from('lineage_nodes').update({ generation: item.gen }).eq('id', item.id)
    for (const c of childrenOf.get(item.id) ?? []) queue.push({ id: c, gen: item.gen + 1 })
    g++
  }

  return NextResponse.json({ ok: true, mergedCount: mergeIds.length, reassignedChildren, reassignedBeneficiaries })
}
