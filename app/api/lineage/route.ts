import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const parentId = request.nextUrl.searchParams.get('parent_id')
  const all = request.nextUrl.searchParams.get('all')
  const nodeId = request.nextUrl.searchParams.get('node_id')

  const client = getClient()
  if (!client) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // node_id mode: return path from root to this node
  if (nodeId) {
    const { data: allNodes } = await client
      .from('lineage_nodes')
      .select('id,name,parent_id,generation')
      .limit(100000)
    const nodes: { id: string; name: string; parent_id: string | null; generation: number }[] = allNodes ?? []
    const map = Object.fromEntries(nodes.map(n => [n.id, n]))

    // walk up from nodeId to root
    const path: { id: string; name: string; generation: number }[] = []
    let cur: { id: string; name: string; parent_id: string | null; generation: number } | undefined = map[nodeId]
    while (cur) {
      path.unshift({ id: cur.id, name: cur.name, generation: cur.generation })
      cur = cur.parent_id ? map[cur.parent_id] : undefined
    }
    return NextResponse.json({ path })
  }

  let query = client
    .from('lineage_nodes')
    .select('*')
    .eq('status', 'verified')
    .order('generation')
    .order('name')

  if (all === '1') {
    // return all verified nodes — limit גבוה כדי לא להיקטע ל-1000 בעץ גדול
    query = query.limit(100000)
  } else if (parentId) {
    query = query.eq('parent_id', parentId)
  } else {
    query = query.is('parent_id', null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const nodes = data ?? []

  // ⚠️ במצב parent_id (רשימת הבחירה לדור הבא), מחזירים גם empty ואת מספר הדור
  // המבוקש בצורה מפורשת — כדי שצרכן חיצוני (טופס נדרים פלוס, UI עצמאי משלהם)
  // יוכל להבחין "דור קיים אך ריק מרשומות מאושרות" מכשל אחר, בלי לנחש
  // מתוך nodes.length לבד. הדור מחושב יחסית לשורש (0-based), כמו בטופס הציבורי.
  if (parentId) {
    let requestedGeneration: number | null = null
    const { data: parentNode } = await client
      .from('lineage_nodes')
      .select('generation')
      .eq('id', parentId)
      .maybeSingle()
    if (parentNode?.generation != null) {
      const { data: rootNode } = await client
        .from('lineage_nodes')
        .select('generation')
        .is('parent_id', null)
        .order('generation')
        .limit(1)
        .maybeSingle()
      const minGen = rootNode?.generation ?? 0
      requestedGeneration = Number(parentNode.generation) - Number(minGen) + 1
    }
    return NextResponse.json({ nodes, empty: nodes.length === 0, generation: requestedGeneration })
  }

  return NextResponse.json({ nodes })
}
