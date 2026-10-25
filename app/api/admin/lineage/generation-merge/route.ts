import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { recalcGenerations } from '@/lib/lineageMerge'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'
import type { SafeNode } from '@/lib/safeMergeGroups'
import { planGenerationMerge, executeGenerationMerge } from '@/lib/generationMerge'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// מיזוג מדורג: דור אחד בכל פעם, מלמעלה למטה (ראו lib/generationMerge.ts).
//
// GET  — תצוגה מקדימה של הדור הבא: מי נשמר, מי נמחק, מה עובר, ומה הוחרג.
// POST — { generation, fingerprint }. מחשב מחדש, ומבצע רק אם התוכנית זהה בדיוק
//        למה שאושר. אחרת 409 בלי לגעת בנתונים.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function loadPlan(admin: NonNullable<ReturnType<typeof getAdminClient>>) {
  const [nodes, bens] = await Promise.all([
    fetchAllRows<SafeNode>((from, to) =>
      admin.from('lineage_nodes').select('id, name, parent_id, generation, status').range(from, to)),
    fetchAllRows<{ lineage_node_id: string | null }>((from, to) =>
      admin.from('beneficiaries').select('lineage_node_id').not('lineage_node_id', 'is', null).range(from, to)),
  ])
  if (nodes.error) return { error: nodes.error }
  // ⚠️ בלי ספירת הכרטסות אי אפשר לדעת אם קבוצה בטוחה — לא ממשיכים בלעדיה.
  if (bens.error) return { error: bens.error }
  const benCount = new Map<string, number>()
  for (const b of bens.rows) {
    if (b.lineage_node_id) benCount.set(b.lineage_node_id, (benCount.get(b.lineage_node_id) ?? 0) + 1)
  }
  const rootId = nodes.rows.find(n => !n.parent_id)?.id ?? null
  return { error: null, plan: planGenerationMerge(nodes.rows, benCount), rootId }
}

export async function GET() {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const r = await loadPlan(admin)
  if (r.error || !r.plan) return NextResponse.json({ error: String(r.error) }, { status: 500 })
  return NextResponse.json(r.plan)
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const body = await request.json().catch(() => null) as { generation?: unknown; fingerprint?: unknown } | null
  const generation = Number(body?.generation)
  const fingerprint = typeof body?.fingerprint === 'string' ? body.fingerprint : ''
  if (!Number.isInteger(generation) || !/^[0-9a-f]{16}$/.test(fingerprint)) {
    return NextResponse.json({ error: 'בקשה לא תקינה: חסר דור או אישור' }, { status: 400 })
  }

  const r = await loadPlan(admin)
  if (r.error || !r.plan) return NextResponse.json({ error: String(r.error) }, { status: 500 })
  const { plan, rootId } = r

  if (plan.generation !== generation || plan.fingerprint !== fingerprint) {
    return NextResponse.json({
      error: 'העץ השתנה מאז התצוגה המקדימה. לא בוצע שום שינוי — רענן ובדוק שוב.',
      stale: true,
    }, { status: 409 })
  }

  const batchId = randomUUID()
  const res = await executeGenerationMerge(admin, plan, { batchId, userId: staff.userId })

  if (res.ok && rootId) await recalcGenerations(admin, rootId)
  invalidateLineageCache()

  await logActivity(admin, {
    userId: staff.userId,
    action: res.ok ? 'lineage_generation_merge' : 'lineage_generation_merge_failed',
    entityType: 'lineage_node',
    details: {
      batchId, generation, groups: res.merged, removed: res.removed,
      children: res.children, families: res.families,
      failure: res.failure ?? null, rolledBack: res.rolledBack ?? null, rollbackError: res.rollbackError ?? null,
    },
  }).catch(() => {})

  return NextResponse.json({ ...res, batchId, generation }, { status: res.ok ? 200 : 500 })
}
