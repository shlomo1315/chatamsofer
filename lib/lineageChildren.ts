// שליפת צאצאים ישירים מעץ הדורות בפורמט של טופס נדרים ({ nodeId, name, relation }).
// משותף ל-nedarim-form/lineage-children ו-lineage-roots. מחזיר אך ורק שמות
// מעץ הדורות (מידע היסטורי מאומת) — לא נתוני מוטבים.
import { createClient } from '@supabase/supabase-js'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

interface LineageRow { id: string; name: string; relation: string | null }

export interface LineageChild { nodeId: string; name: string; relation: string | null }

// parentId=null → השורש (parent_id is null); אחרת ילדי הצומת. status=verified בלבד.
export async function fetchLineageChildren(
  parentId: string | null,
): Promise<{ children: LineageChild[] } | { error: string }> {
  const client = getClient()
  if (!client) return { error: 'שגיאת שרת' }

  let query = client
    .from('lineage_nodes')
    .select('id,name,relation')
    .eq('status', 'verified')
    .order('generation')
    .order('name')

  query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null)

  const { data, error } = await query
  if (error) return { error: error.message }

  const children = (data as LineageRow[] ?? []).map((n) => ({
    nodeId: n.id,
    name: n.name,
    relation: n.relation ?? null,
  }))
  return { children }
}
