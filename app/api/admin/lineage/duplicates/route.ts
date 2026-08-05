import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { compareHebrewNames, type MatchLevel } from '@/lib/hebrewNames'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─────────────────────────────────────────────────────────────────────────────
// סריקת כפילויות בעץ הדורות.
//
// ⚠️ ההשוואה נעשית *בין אחים בלבד* (אותו אב), ולא בין כל שני צמתים בעץ. שתי
// סיבות: השוואת-הכול היא O(n²) על מאות אלפי זוגות, וחשוב מכך — שני אנשים
// באותו שם בענפים רחוקים הם לרוב באמת שני אנשים. אב משותף הוא ההקשר שהופך
// דמיון-שמות לראיה.
//
// ואין צורך ביותר מזה: מיזוג זוג הופך את ילדיהם לאחים, והמפל (lineageMerge)
// כבר ממזג אותם אוטומטית. סריקה חוזרת אחרי מיזוג תחשוף את השכבה הבאה.
// ─────────────────────────────────────────────────────────────────────────────

interface NodeRow {
  id: string; name: string; parent_id: string | null
  generation: number; status: string | null; relation: string | null
}

export async function GET(request: NextRequest) {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const minLevel = (request.nextUrl.searchParams.get('level') ?? 'possible') as MatchLevel

  // ⚠️ שליפה בדפים: .limit() לבדו לא עוקף את db-max-rows=1000 של PostgREST —
  // סריקת כפילויות על עץ של אלפי צמתים נחתכה בשקט ל-1000. ראו lib/fetchAllRows.
  const { rows: nodes, error } = await fetchAllRows<NodeRow>((from, to) =>
    admin.from('lineage_nodes').select('id, name, parent_id, generation, status, relation').range(from, to),
  )
  if (error) return NextResponse.json({ error }, { status: 500 })

  // זוגות שכבר נדחו במפורש — לא מוצעים שוב
  const { data: notDup } = await admin.from('lineage_not_duplicates').select('node_a, node_b')
  const rejected = new Set((notDup ?? []).map(r => `${r.node_a}|${r.node_b}`))
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

  // מספר הילדים והמשפחות של כל צומת — נתונים שהמשתמש צריך כדי להכריע
  const childCount = new Map<string, number>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    childCount.set(n.parent_id, (childCount.get(n.parent_id) ?? 0) + 1)
  }
  const { data: bens } = await admin.from('beneficiaries').select('lineage_node_id').not('lineage_node_id', 'is', null)
  const benCount = new Map<string, number>()
  for (const b of bens ?? []) {
    const id = (b as { lineage_node_id: string }).lineage_node_id
    benCount.set(id, (benCount.get(id) ?? 0) + 1)
  }

  const byParent = new Map<string, NodeRow[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    if ((n.status ?? '') === 'rejected') continue   // נדחה — לא משתתף
    const arr = byParent.get(n.parent_id) ?? []
    arr.push(n)
    byParent.set(n.parent_id, arr)
  }

  const RANK: Record<MatchLevel, number> = { none: 0, possible: 1, strong: 2, exact: 3 }
  const wanted = RANK[minLevel] ?? 1

  interface Group {
    level: MatchLevel
    reason: string
    parentId: string
    parentName: string
    generation: number
    nodes: { id: string; name: string; status: string | null; relation: string | null; children: number; families: number }[]
  }
  const groups: Group[] = []
  const nameById = new Map(nodes.map(n => [n.id, n.name]))

  for (const [parentId, sibs] of byParent) {
    if (sibs.length < 2) continue
    // איחוד קבוצות: כל אח מצטרף לקבוצה של אח שהוא תואם לו
    const used = new Set<string>()
    for (let i = 0; i < sibs.length; i++) {
      if (used.has(sibs[i].id)) continue
      const bucket = [sibs[i]]
      let level: MatchLevel = 'exact'
      let reason = ''
      for (let j = i + 1; j < sibs.length; j++) {
        if (used.has(sibs[j].id)) continue
        if (rejected.has(pairKey(sibs[i].id, sibs[j].id))) continue
        const m = compareHebrewNames(sibs[i].name, sibs[j].name)
        if (RANK[m.level] < wanted) continue
        bucket.push(sibs[j])
        used.add(sibs[j].id)
        // רמת הקבוצה = החלשה מבין ההתאמות, כדי שלא תיראה בטוחה יותר משהיא
        if (RANK[m.level] < RANK[level]) { level = m.level; reason = m.reason }
        else if (!reason) reason = m.reason
      }
      if (bucket.length < 2) continue
      used.add(sibs[i].id)
      groups.push({
        level, reason: reason || 'השמות זהים',
        parentId,
        parentName: nameById.get(parentId) ?? '—',
        generation: bucket[0].generation,
        nodes: bucket.map(b => ({
          id: b.id, name: b.name, status: b.status, relation: b.relation,
          children: childCount.get(b.id) ?? 0,
          families: benCount.get(b.id) ?? 0,
        })),
      })
    }
  }

  // הכי ודאי קודם, ובתוך זה הדורות המוקדמים — מיזוג גבוה מקפל יותר במפל
  groups.sort((a, b) => RANK[b.level] - RANK[a.level] || a.generation - b.generation)

  const counts = {
    exact: groups.filter(g => g.level === 'exact').length,
    strong: groups.filter(g => g.level === 'strong').length,
    possible: groups.filter(g => g.level === 'possible').length,
  }
  return NextResponse.json({ groups, counts, scanned: nodes.length })
}

// סימון "אינם אותו אדם" — כדי שהזוג לא יוצע שוב
export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  let body: { ids?: string[] }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const ids = Array.from(new Set((body.ids ?? []).filter(Boolean)))
  if (ids.length < 2) return NextResponse.json({ error: 'נדרשים לפחות שני צמתים' }, { status: 400 })

  // כל הזוגות בקבוצה — כדי שאף אחד מהם לא יוצע שוב מול השני
  const rows: { node_a: string; node_b: string; created_by: string }[] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]]
      rows.push({ node_a: a, node_b: b, created_by: staff.userId })
    }
  }
  const { error } = await admin.from('lineage_not_duplicates').upsert(rows, { onConflict: 'node_a,node_b' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, pairs: rows.length })
}
