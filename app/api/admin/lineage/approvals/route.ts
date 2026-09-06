import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { invalidateLineageCache, subtreeNodeIds, type TreeNodeRow } from '@/lib/lineageSync'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// מצב האישור בעץ הדורות — "מי מאושר, מי לא, ומאיפה האישור".
//
// 🔴 הבעיה שזה פותר: 357 מתוך 10,505 הצמתים מאושרים (3.4%), אבל בעץ עצמו
// גוף הצומת נצבע לפי *הדור* והסטטוס היה נקודה זעירה — ולכן אי אפשר היה
// לדעת במבט מי אושר. בנוסף לא נשמר שום תיעוד של מי אישר ומתי, ולכן גם
// אחרי בדיקה ידנית לא היה אפשר לענות "על סמך מה זה מאושר".
//
// GET  — תמונת מצב: מונים, פילוח לפי דור, ותור עבודה ממוין לפי השפעה.
// POST — אישור קבוצתי (רשימת צמתים / כל ילדי אב / ענף שלם) עם תיעוד מקור.
//        ⚠️ תמיד עם dryRun תחילה — ראו preview.
// ─────────────────────────────────────────────────────────────────────────────

function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const NODE_COLS = 'id, name, parent_id, generation, status, relation, approval_source, approved_at, approval_note'

interface NodeRow {
  id: string; name: string; parent_id: string | null; generation: number
  status: string | null; relation: string | null
  approval_source: string | null; approved_at: string | null; approval_note: string | null
}

/** תווית מקור האישור בעברית. ⚠️ מקור אמת יחיד — גם הממשק קורא מכאן. */
export const SOURCE_LABEL: Record<string, string> = {
  legacy: 'אושר לפני התיעוד',
  staff: 'אושר ידנית',
  bulk: 'אישור קבוצתי',
  family: 'אושר לפי בקשת משפחה',
  import: 'הגיע מאושר מייבוא',
}

export async function GET(request: NextRequest) {
  if (!(await requirePermission('lineage', 'view'))) return forbidden()
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const sp = request.nextUrl.searchParams
  const parentId = sp.get('parent')

  // ⚠️ שליפה בדפים — .limit() לבדו אינו עוקף את db-max-rows=1000, והעץ
  // מכיל 10,505 צמתים. ראו lib/fetchAllRows.
  const { rows: nodes } = await fetchAllRows<NodeRow>((from, to) =>
    admin.from('lineage_nodes').select(NODE_COLS).range(from, to),
  )

  // כמה משפחות תלויות בכל צומת — זה מה שהופך אישור לדחוף.
  const { rows: bens } = await fetchAllRows<{ lineage_node_id: string | null }>((from, to) =>
    admin.from('beneficiaries').select('lineage_node_id').not('lineage_node_id', 'is', null).range(from, to),
  )
  const famCount = new Map<string, number>()
  for (const b of bens) {
    if (!b.lineage_node_id) continue
    famCount.set(b.lineage_node_id, (famCount.get(b.lineage_node_id) ?? 0) + 1)
  }

  const kids = new Map<string, NodeRow[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    const l = kids.get(n.parent_id)
    if (l) l.push(n); else kids.set(n.parent_id, [n])
  }
  const byId = new Map(nodes.map(n => [n.id, n]))

  const st = (n: NodeRow) => (n.status === 'verified' || n.status === 'rejected' ? n.status : 'pending')

  // ── מונים כלליים ──
  const summary = {
    total: nodes.length,
    verified: nodes.filter(n => st(n) === 'verified').length,
    pending: nodes.filter(n => st(n) === 'pending').length,
    rejected: nodes.filter(n => st(n) === 'rejected').length,
    // ⚠️ "מאושרים ללא תיעוד" — המספר שמסביר למה אי אפשר היה לסמוך על הירוק.
    legacyApproved: nodes.filter(n => st(n) === 'verified' && (n.approval_source ?? 'legacy') === 'legacy').length,
    familiesOnPending: nodes.reduce((a, n) => a + (st(n) === 'pending' ? (famCount.get(n.id) ?? 0) : 0), 0),
    familiesOnVerified: nodes.reduce((a, n) => a + (st(n) === 'verified' ? (famCount.get(n.id) ?? 0) : 0), 0),
  }

  // ── פילוח לפי דור ──
  const genMap = new Map<number, { generation: number; total: number; verified: number; pending: number; rejected: number }>()
  for (const n of nodes) {
    const g = n.generation ?? 0
    const row = genMap.get(g) ?? { generation: g, total: 0, verified: 0, pending: 0, rejected: 0 }
    row.total++
    row[st(n) as 'verified' | 'pending' | 'rejected']++
    genMap.set(g, row)
  }
  const byGeneration = [...genMap.values()].sort((a, b) => a.generation - b.generation)

  // ── מצב אב מבוקש (מסך "אישור דור אחר דור") ──
  let focus: unknown = null
  if (parentId) {
    const parent = byId.get(parentId)
    if (parent) {
      focus = {
        parent: {
          id: parent.id, name: parent.name, generation: parent.generation,
          status: st(parent), approvalSource: parent.approval_source,
        },
        children: (kids.get(parentId) ?? [])
          .map(c => ({
            id: c.id, name: c.name, generation: c.generation, status: st(c),
            relation: c.relation,
            childCount: (kids.get(c.id) ?? []).length,
            families: famCount.get(c.id) ?? 0,
            approvalSource: c.approval_source,
            approvedAt: c.approved_at,
            approvalNote: c.approval_note,
          }))
          .sort((a, b) => b.families - a.families || a.name.localeCompare(b.name, 'he')),
      }
    }
  }

  // ── תור העבודה ──
  // 🔴 ממוין לפי *השפעה* ולא לפי סדר העץ: אב שתלויות בו 40 משפחות שווה
  // יותר מאב בלי אף משפחה. בלי מיון כזה המנהל עובד לפי סדר שרירותי ולא
  // מרגיש התקדמות.
  const queue = [...kids.entries()]
    .map(([pid, children]) => {
      const parent = byId.get(pid)
      const pendingKids = children.filter(c => st(c) === 'pending')
      if (!parent || !pendingKids.length) return null
      return {
        parentId: pid,
        parentName: parent.name,
        parentStatus: st(parent),
        generation: parent.generation,
        pendingCount: pendingKids.length,
        totalCount: children.length,
        // סך המשפחות שממתינות מתחת לאב הזה — מדד ההשפעה.
        families: pendingKids.reduce((a, c) => a + (famCount.get(c.id) ?? 0), 0),
      }
    })
    .filter(Boolean) as { families: number; pendingCount: number }[]
  queue.sort((a, b) => b.families - a.families || b.pendingCount - a.pendingCount)

  // ── המאושרים, לתצוגה מדויקת ──
  // ⚠️ זו הרשימה שעונה על "מי מאושר ומאיפה האישור" — כולל מי שאושר לפני
  // שהתיעוד הופעל ולכן אין עליו מידע.
  const approved = nodes
    .filter(n => st(n) === 'verified')
    .map(n => ({
      id: n.id, name: n.name, generation: n.generation,
      approvalSource: n.approval_source ?? 'legacy',
      approvedAt: n.approved_at,
      approvalNote: n.approval_note,
      families: famCount.get(n.id) ?? 0,
      childCount: (kids.get(n.id) ?? []).length,
      // ⚠️ צומת מאושר שאביו אינו מאושר = שרשרת שבורה. זה בדיוק מה שאי
      // אפשר היה לראות קודם, והוא מסביר "ירוקים שלא באמת מאושרים".
      parentName: n.parent_id ? byId.get(n.parent_id)?.name ?? null : null,
      parentApproved: n.parent_id ? st(byId.get(n.parent_id) ?? ({} as NodeRow)) === 'verified' : true,
    }))
    .sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, 'he'))

  return NextResponse.json({
    summary,
    byGeneration,
    focus,
    queue: queue.slice(0, 200),
    approved,
    brokenChain: approved.filter(a => !a.parentApproved).length,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — אישור/שינוי סטטוס קבוצתי.
//
// body: { nodeIds?, parentId?, subtreeOf?, status, note?, dryRun? }
//   nodeIds   — רשימה מפורשת
//   parentId  — כל *ילדי* האב שממתינים
//   subtreeOf — כל הענף מתחת לצומת (כולל הצומת עצמו)
//
// 🔴 dryRun חובה לפני ביצוע: אישור ענף נוגע במאות צמתים בבת אחת, ואישור
// שגוי של דור שלא נבדק גרוע מלא לאשר כלום.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  let body: {
    nodeIds?: string[]; parentId?: string; subtreeOf?: string
    status?: string; note?: string; dryRun?: boolean
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const status = body.status ?? 'verified'
  if (!['verified', 'pending', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'סטטוס לא מוכר' }, { status: 400 })
  }

  const { rows: nodes } = await fetchAllRows<NodeRow>((from, to) =>
    admin.from('lineage_nodes').select(NODE_COLS).range(from, to),
  )
  const byId = new Map(nodes.map(n => [n.id, n]))

  // ── קביעת קבוצת היעד ──
  let targetIds: string[] = []
  let scope: 'list' | 'children' | 'subtree' = 'list'

  if (body.subtreeOf) {
    scope = 'subtree'
    const ids = subtreeNodeIds(nodes as unknown as TreeNodeRow[], body.subtreeOf)
    targetIds = [...ids]
  } else if (body.parentId) {
    scope = 'children'
    targetIds = nodes.filter(n => n.parent_id === body.parentId).map(n => n.id)
  } else if (Array.isArray(body.nodeIds)) {
    targetIds = body.nodeIds.filter(id => typeof id === 'string' && byId.has(id))
  }

  // ⚠️ רק מה שבאמת משתנה — אין טעם לכתוב מחדש צומת שכבר בסטטוס המבוקש,
  // וזה גם משאיר את התיעוד (approved_at) של האישור המקורי על כנו.
  const changing = targetIds.filter(id => {
    const n = byId.get(id)
    if (!n) return false
    const cur = n.status === 'verified' || n.status === 'rejected' ? n.status : 'pending'
    return cur !== status
  })

  if (!changing.length) {
    return NextResponse.json({ ok: true, changed: 0, preview: [], message: 'אין מה לשנות — כל הצמתים כבר בסטטוס המבוקש' })
  }

  // ── תצוגה מקדימה ──
  // 🔴 מוחזרת תמיד, גם בביצוע: המסך מציג אותה לפני שהמנהל מאשר.
  const preview = changing.slice(0, 500).map(id => {
    const n = byId.get(id)!
    return { id, name: n.name, generation: n.generation, from: n.status ?? 'pending' }
  })

  if (body.dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, changed: changing.length, preview })
  }

  // ── ביצוע ──
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status, updated_at: now }
  if (status === 'verified') {
    patch.approval_source = scope === 'list' ? 'staff' : 'bulk'
    patch.approved_at = now
    patch.approved_by = staff.userId
    if (body.note) patch.approval_note = String(body.note).slice(0, 500)
  } else {
    // ⚠️ ביטול אישור מנקה את התיעוד — אחרת צומת ממתין נושא חותמת אישור ישנה.
    patch.approval_source = null
    patch.approved_at = null
    patch.approved_by = null
  }

  // ⚠️ במנות: PostgREST מגביל את גודל הבקשה, וענף יכול להכיל מאות מזהים.
  const BATCH = 200
  let changed = 0
  for (let i = 0; i < changing.length; i += BATCH) {
    const slice = changing.slice(i, i + BATCH)
    const { error } = await admin.from('lineage_nodes').update(patch).in('id', slice)
    if (error) return NextResponse.json({ error: error.message, changed }, { status: 500 })
    changed += slice.length
  }

  invalidateLineageCache()
  await logActivity(admin, {
    userId: staff.userId,
    action: status === 'verified' ? 'lineage_bulk_approved' : 'lineage_bulk_status_changed',
    entityType: 'lineage_node',
    entityId: body.parentId ?? body.subtreeOf ?? changing[0],
    details: { scope, status, count: changed, note: body.note ?? null },
  }).catch(() => {})

  return NextResponse.json({ ok: true, changed, preview })
}
