import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { mergeWithCascade } from '@/lib/lineageMerge'
import { logActivity } from '@/lib/activityLog'

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
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  // cascade — ברירת המחדל דלוקה: זה הלב של הפתרון (ראו lib/lineageMerge).
  let body: { keepId?: string; mergeIds?: string[]; cascadeDown?: boolean; cascadeUp?: boolean }
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

  // ⚠️ batchId מקבץ את המיזוג *וכל מה שנגרר ממנו במפל*, כדי שביטול יחזיר את
  // כל השרשרת ולא חוליה בודדת שתשאיר את העץ במצב ביניים.
  const batchId = randomUUID()
  let result
  try {
    result = await mergeWithCascade(admin, {
      keepId, mergeIds, batchId,
      userId: staff.userId,
      cascadeDown: body.cascadeDown !== false,
      cascadeUp: body.cascadeUp !== false,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה במיזוג' },
      { status: 500 },
    )
  }

  await logActivity(admin, {
    userId: staff.userId,
    action: 'lineage_nodes_merged',
    entityType: 'lineage_node', entityId: keepId,
    details: {
      batchId, requested: mergeIds.length, cascaded: result.cascadedCount,
      children: result.reassignedChildren, beneficiaries: result.reassignedBeneficiaries,
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, ...result })
}
