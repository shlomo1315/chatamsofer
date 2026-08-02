import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { loadCascadePlan } from '@/lib/lineageMerge'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─────────────────────────────────────────────────────────────────────────────
// תצוגה מקדימה של המפל — בלי לגעת בנתונים.
//
// ⚠️ נועד לשני דברים שאי אפשר בלעדיהם:
//  1. להראות מראש את כל ההיקף (כמה דורות, למעלה ולמטה) — המפל נוגע בעשרות
//     צמתים, ולגלות את זה בדיעבד זה מאוחר מדי.
//  2. לאסוף הכרעת שם לכל דור. "ר' יוסף יהודה" ו-"יוסף יהודה" הם אותו מפתח,
//     ולכן המיזוג נכון — אבל *איזה נוסח יישאר* אינה החלטה של המערכת, והיא
//     נעשתה עד כה בשקט.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  let body: { keepId?: string; mergeIds?: string[]; cascadeUp?: boolean; cascadeDown?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const keepId = String(body.keepId ?? '')
  const mergeIds = Array.from(new Set((body.mergeIds ?? []).filter(Boolean)))
  if (!keepId || !mergeIds.length) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })

  const { plan, nodes } = await loadCascadePlan(admin, keepId, mergeIds, {
    up: body.cascadeUp, down: body.cascadeDown,
  })
  const byId = new Map(nodes.map(n => [n.id, n]))
  const kidCount = new Map<string, number>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    kidCount.set(n.parent_id, (kidCount.get(n.parent_id) ?? 0) + 1)
  }

  const steps = plan.steps.map(s => {
    const names = [s.keepId, ...s.mergeIds].map(id => byId.get(id)?.name ?? '').filter(Boolean)
    const uniq = [...new Set(names)]
    return {
      keepId: s.keepId,
      generation: s.generation,
      direction: s.direction,
      count: s.mergeIds.length + 1,
      names: uniq,
      // ⚠️ רק כשהניסוחים שונים נדרשת הכרעה. שמות זהים לחלוטין אינם שאלה,
      // ואין טעם להטריח את המשתמש בהם — עם עשרות דורות זה היה הופך לרעש.
      needsNameChoice: uniq.length > 1,
      candidates: [s.keepId, ...s.mergeIds].map(id => {
        const n = byId.get(id)
        return {
          id, name: n?.name ?? '', status: n?.status ?? null, relation: n?.relation ?? null,
          children: kidCount.get(id) ?? 0,
        }
      }),
    }
  })

  return NextResponse.json({
    steps,
    stopped: plan.stopped,
    topId: plan.topId,
    totalMerged: plan.totalMerged,
    generations: [...new Set(plan.steps.map(s => s.generation))].sort((a, b) => a - b),
  })
}
