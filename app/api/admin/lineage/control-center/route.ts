import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { findSiblingDuplicates, pairKey, type DupNode } from '@/lib/lineageDupGroups'
import { findSelfDuplicates, type SelfDupNode, type SelfDupBen } from '@/lib/selfDuplicateNodes'
import { findGhostChildren, type GhostNodeRow, type GhostBenRow } from '@/lib/ghostChildren'
import { buildControlCenter, type ControlBen } from '@/lib/lineageControlCenter'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// ─────────────────────────────────────────────────────────────────────────────
// מרכז בקרה לעץ הדורות.
//
// GET  → מונים (כפילויות לפי רמה, סטטוסי אישור, לא מקושרות, חיתוך ביניהם) +
//        רשימת כל המשפחות עם הבעיות של כל אחת, לסקירה משפחה-משפחה.
// POST { id, reviewed } → סימון "נבדקה, תקין" (מי ומתי), או ביטולו.
//
// 🔴 קריאה בלבד חוץ מהסימון. אין כאן כלל חדש: אותן פונקציות סריקה של
// המסכים הקיימים (dup-review, self-duplicates, ghost-children), כדי שהמספרים
// יתאימו. ⚠️ שליפה בדפים — .limit() נחתך בשקט ל-1000.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_COLS = 'id, full_name, family_name, spouse_name, id_number, spouse_id_number, gender, children, lineage_node_id, lineage_chain, eligibility_status, deep_review_reason'
const MARK_COLS = 'lineage_reviewed_at, lineage_reviewed_by'

type BenRow = ControlBen & SelfDupBen & GhostBenRow

export async function GET() {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const loadBens = (cols: string) =>
    fetchAllRows<BenRow>((from, to) => db.from('beneficiaries').select(cols).range(from, to) as unknown as PromiseLike<{ data: BenRow[] | null; error: { message: string } | null }>)

  // העמודות של סימון הסקירה נוספות במיגרציה נפרדת; בלעדיה המסך עדיין עובד.
  let marksReady = true
  let bensRes = await loadBens(`${BASE_COLS}, ${MARK_COLS}`)
  if (bensRes.error) { marksReady = false; bensRes = await loadBens(BASE_COLS) }

  const [nodesRes, notDupRes] = await Promise.all([
    fetchAllRows<DupNode & SelfDupNode & GhostNodeRow>((from, to) =>
      db.from('lineage_nodes').select('id, name, parent_id, generation, status, relation, id_number').range(from, to)),
    fetchAllRows<{ node_a: string; node_b: string }>((from, to) =>
      db.from('lineage_not_duplicates').select('node_a, node_b').range(from, to)),
  ])
  if (nodesRes.error) return NextResponse.json({ error: `טעינת העץ נכשלה: ${nodesRes.error}` }, { status: 500 })
  if (bensRes.error) return NextResponse.json({ error: `טעינת הכרטסות נכשלה: ${bensRes.error}` }, { status: 500 })

  const nodes = nodesRes.rows
  const bens = bensRes.rows
  const notDup = new Set(notDupRes.rows.map(r => pairKey(r.node_a, r.node_b)))
  const groups = findSiblingDuplicates(nodes, notDup)
  const selfRows = findSelfDuplicates(nodes, bens).rows
  const ghostRows = findGhostChildren(nodes, bens).rows

  const { families, summary, parallelGroups } = buildControlCenter({ nodes, bens, groups, selfRows, ghostRows })
  // מנהל בלבד לעומת עורך — לפי תפקיד המבקש
  const staff = await requirePermission('lineage', 'edit')
  return NextResponse.json({ summary, families, parallelGroups, marksReady, isAdmin: staff?.role === 'admin' },
    { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { id?: string; reviewed?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.id || typeof body.id !== 'string') return NextResponse.json({ error: 'חסר מזהה משפחה' }, { status: 400 })

  const patch = body.reviewed === false
    ? { lineage_reviewed_at: null, lineage_reviewed_by: null }
    : { lineage_reviewed_at: new Date().toISOString(), lineage_reviewed_by: staff.email ?? staff.userId }
  const { error } = await db.from('beneficiaries').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ error: 'השמירה נכשלה (ייתכן שהמיגרציה טרם הורצה)' }, { status: 500 })
  return NextResponse.json({ ok: true, ...patch })
}
