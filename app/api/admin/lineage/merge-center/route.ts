import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { mergeWithCascade, recalcGenerations } from '@/lib/lineageMerge'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { buildClusters, type ClusterNode } from '@/lib/mergeClusters'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// מרכז המיזוגים — אשכולות של שם זהה בדיוק באותו דור, *בלי* דרישת אב משותף.
//
// ⚠️ למה מסלול נוסף ולא הרחבה של safe-merge: המסלול הבטוח מקבץ לפי
// (אב, דור, שם), ולכן הוא תופס רק עותקים שנרשמו תחת אותו אב. הכפילות
// השכיחה בעץ הזה הפוכה — כל נכד רשם את סבו מחדש מתחת לענף שלו, כך שאותו
// אדם יושב תחת אבות שונים ואינו נראה שם כלל. הרחבת המסלול הבטוח הייתה
// מרככת דווקא את הכלל שמצדיק את שמו ("בעיניים עצומות"), ולכן הוא נשאר כפי
// שהוא וזה נבנה לצידו — עם הכרעה אנושית לכל אשכול.
//
// ⚠️ אשכול שבו יותר מכרטסת אחת מסומן multi_card ו*אינו נחסם*: שתי כרטסות
// תחת שם זהה הן או אותו אדם שנרשם פעמיים, או שני אנשים שונים. מהנתונים
// לבדם אי אפשר להכריע, ולכן ההכרעה חוזרת למנהל עם אזהרה מפורשת.
//
// GET  — רשימת האשכולות עם הפרטים שמאפשרים להכריע.
// POST — מבצע מיזוג של אשכול אחד: { keepId, mergeIds }.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

type BenRow = { id: string; lineage_node_id: string | null; full_name: string | null; family_name: string | null }

async function loadClusters(admin: NonNullable<ReturnType<typeof getAdminClient>>) {
  // ⚠️ fetchAllRows ולא .limit(): שאילתה כלל-עצית נחתכת ב-1000 שורות, ואשכול
  // שחציו מעבר לגבול היה נראה קטן ממה שהוא — ומיזוג חלקי משאיר עותקים.
  const nodes = await fetchAllRows<ClusterNode>((from, to) =>
    admin.from('lineage_nodes').select('id, name, parent_id, generation, status, id_number').range(from, to))
  if (nodes.error) return { error: nodes.error, clusters: [], nameById: new Map<string, string>() }

  const childCount = new Map<string, number>()
  for (const n of nodes.rows) {
    if (n.parent_id) childCount.set(n.parent_id, (childCount.get(n.parent_id) ?? 0) + 1)
  }

  const bens = await fetchAllRows<BenRow>((from, to) =>
    admin.from('beneficiaries').select('id, lineage_node_id, full_name, family_name')
      .not('lineage_node_id', 'is', null).range(from, to))
  const bensByNode = new Map<string, { id: string; name: string }[]>()
  for (const b of bens.rows) {
    if (!b.lineage_node_id) continue
    const arr = bensByNode.get(b.lineage_node_id) ?? []
    arr.push({ id: b.id, name: [b.family_name, b.full_name].filter(Boolean).join(' ').trim() || '—' })
    bensByNode.set(b.lineage_node_id, arr)
  }

  const nameById = new Map(nodes.rows.map(n => [n.id, n.name]))
  return { error: null, clusters: buildClusters(nodes.rows, childCount, bensByNode), nameById }
}

export async function GET() {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const { error, clusters, nameById } = await loadClusters(admin)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const stats = {
    clusters: clusters.length,
    removable: clusters.reduce((t, c) => t + c.removable, 0),
    clean: clusters.filter(c => c.risk === 'clean').length,
    singleCard: clusters.filter(c => c.risk === 'single_card').length,
    multiCard: clusters.filter(c => c.risk === 'multi_card').length,
    sameParent: clusters.filter(c => c.sameParent).length,
  }

  // פילוח לפי דור — מפריד בין כפילות היסטורית באבות (מה שהמיזוג נועד לנקות)
  // לבין עותק לכל נרשם בדורות העמוקים (תקלה שצריך לתקן במקור, לא למזג מעליה).
  const perGen = new Map<number, { clusters: number; removable: number }>()
  for (const c of clusters) {
    const cur = perGen.get(c.generation) ?? { clusters: 0, removable: 0 }
    cur.clusters++; cur.removable += c.removable
    perGen.set(c.generation, cur)
  }

  // ⚠️ תקרה של 300 אשכולות בתשובה — והיא מדווחת במפורש ב-truncated, כדי
  // ש"טיפלתי בכל מה שהמסך הראה" לא ייקרא בטעות כ"טיפלתי בהכל".
  const LIMIT = 300
  return NextResponse.json({
    stats,
    byGeneration: [...perGen.entries()].sort((a, b) => a[0] - b[0])
      .map(([generation, v]) => ({ generation, ...v })),
    truncated: Math.max(0, clusters.length - LIMIT),
    clusters: clusters.slice(0, LIMIT).map(c => ({
      key: c.key, name: c.name, generation: c.generation,
      removable: c.removable, sameParent: c.sameParent,
      risk: c.risk, cardCount: c.cardCount,
      suggestedKeepId: c.suggestedKeepId,
      members: c.members.map(m => ({
        id: m.id, name: m.name, status: m.status ?? 'verified',
        children: m.children, idNumber: m.id_number ?? null,
        parentName: m.parent_id ? (nameById.get(m.parent_id) ?? '—') : 'שורש',
        beneficiaryIds: m.beneficiaryIds, beneficiaryNames: m.beneficiaryNames,
      })),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  let body: { keepId?: string; mergeIds?: string[] }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const keepId = String(body.keepId ?? '')
  const mergeIds = Array.isArray(body.mergeIds) ? body.mergeIds.map(String) : []
  if (!UUID_RE.test(keepId)) return NextResponse.json({ error: 'מזהה צומת לא תקין' }, { status: 400 })
  if (!mergeIds.length) return NextResponse.json({ error: 'לא נבחרו צמתים למיזוג' }, { status: 400 })
  if (!mergeIds.every(id => UUID_RE.test(id))) return NextResponse.json({ error: 'מזהה צומת לא תקין' }, { status: 400 })
  if (mergeIds.includes(keepId)) return NextResponse.json({ error: 'הצומת הנשמר אינו יכול להימזג לעצמו' }, { status: 400 })

  // ⚠️ אימות בשרת שהצמתים אכן שם-זהה+דור-זהה. הלקוח שולח מזהים, ובקשה
  // מזויפת (או מסך שהתיישן אחרי מיזוג אחר) הייתה יכולה למזג שני אנשים
  // שאינם קשורים — פעולה שקשה מאוד לשחזר ממנה.
  const { data: rows, error: loadErr } = await admin
    .from('lineage_nodes').select('id, name, generation, status').in('id', [keepId, ...mergeIds])
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!rows || rows.length !== mergeIds.length + 1) {
    return NextResponse.json({ error: 'חלק מהצמתים לא נמצאו — רענן את המסך' }, { status: 409 })
  }
  const norm = (s: string) => String(s ?? '').trim().replace(/\s+/g, ' ')
  const keep = rows.find(r => r.id === keepId)!
  const mismatch = rows.find(r => norm(r.name) !== norm(keep.name) || r.generation !== keep.generation)
  if (mismatch) {
    return NextResponse.json({ error: 'הצמתים אינם בעלי שם ודור זהים — רענן את המסך' }, { status: 409 })
  }

  // ⚠️ בלי מפל בשום כיוון: המפל מזהה קרבה לפי autoMergeKey (שמסיר תארים),
  // כלומר כלל *מקורב* יותר מזה שהמנהל אישר על המסך. מיזוג האשכול הזה הוא
  // בדיוק מה שהוא נראה — לא יותר.
  //
  // ⚠️ skipRecalc + ריצה אחת בסוף: recalcGenerations סורק את כל הטבלה, וכאן
  // הדורות ממילא אינם משתנים (כל האשכול באותו דור, הצומת הנשמר אינו זז).
  const batchId = randomUUID()
  let merged = 0, children = 0, families = 0
  try {
    const r = await mergeWithCascade(admin, {
      keepId, mergeIds, batchId, userId: staff.userId,
      cascadeDown: false, cascadeUp: false, skipRecalc: true,
    })
    merged = r.mergedCount
    children = r.reassignedChildren
    families = r.reassignedBeneficiaries
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'המיזוג נכשל', batchId,
    }, { status: 500 })
  }

  const { data: rootRow } = await admin.from('lineage_nodes').select('id').is('parent_id', null).limit(1).maybeSingle()
  if (rootRow?.id) await recalcGenerations(admin, rootRow.id).catch(() => {})
  invalidateLineageCache()

  await logActivity(admin, {
    userId: staff.userId, action: 'lineage_merge_center',
    entityType: 'lineage_node', entityId: keepId,
    details: { name: keep.name, generation: keep.generation, merged, children, families, batchId },
  }).catch(() => {})

  return NextResponse.json({ ok: true, merged, children, families, batchId })
}
