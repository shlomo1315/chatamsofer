import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─────────────────────────────────────────────────────────────────────────────
// ניהול הצעות תיקון-ייחוס מצאצאים. GET — רשימת הממתינות (עם שמות הצמתים).
// POST — אישור (מחיל את השינוי בעץ) או דחייה. האישור הוא היחיד שנוגע בעץ,
// ולכן הוא נעשה כאן בצד הניהול המאומת ולא בצד הציבורי.
// ─────────────────────────────────────────────────────────────────────────────

interface SuggestionRow {
  id: string; kind: 'rename' | 'add_child' | 'reparent' | 'note'
  node_id: string | null; parent_id: string | null
  proposed_name: string | null; relation: 'son' | 'son_in_law' | null
  payload: { text?: string } | null; reviewer_name: string | null
  created_at: string; status: string
}

export async function GET() {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const { data, error } = await admin
    .from('lineage_review_suggestions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as SuggestionRow[]
  // שמות הצמתים המעורבים — כדי שהמנהל יראה על מה מדובר בלי לחפש
  const ids = Array.from(new Set(rows.flatMap(r => [r.node_id, r.parent_id]).filter(Boolean) as string[]))
  const nameById: Record<string, string> = {}
  if (ids.length) {
    const { data: ns } = await admin.from('lineage_nodes').select('id, name').in('id', ids)
    for (const n of ns ?? []) nameById[(n as { id: string }).id] = (n as { name: string }).name
  }

  return NextResponse.json({ suggestions: rows, nameById })
}

// POST { id, action: 'approve' | 'reject' }
export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  let body: { id?: string; action?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.id || !['approve', 'reject'].includes(body.action ?? '')) {
    return NextResponse.json({ error: 'פרמטרים לא תקינים' }, { status: 400 })
  }

  const { data: sug } = await admin.from('lineage_review_suggestions').select('*').eq('id', body.id).maybeSingle()
  if (!sug) return NextResponse.json({ error: 'ההצעה לא נמצאה' }, { status: 404 })
  if ((sug as SuggestionRow).status !== 'pending') return NextResponse.json({ error: 'ההצעה כבר טופלה' }, { status: 409 })
  const s = sug as SuggestionRow

  // ── דחייה: רק סימון סטטוס, בלי לגעת בעץ ──
  if (body.action === 'reject') {
    await admin.from('lineage_review_suggestions').update({
      status: 'rejected', resolved_at: new Date().toISOString(), resolved_by: staff.userId,
    }).eq('id', s.id)
    return NextResponse.json({ ok: true })
  }

  // ── אישור: מחילים את השינוי בעץ לפי סוג ההצעה ──
  try {
    if (s.kind === 'rename' && s.node_id && s.proposed_name) {
      await admin.from('lineage_nodes').update({ name: s.proposed_name }).eq('id', s.node_id)
    } else if (s.kind === 'reparent' && s.node_id && s.parent_id) {
      // מניעת מעגל: parent_id החדש לא יכול להיות הצומת עצמו (נבדק כבר), והעדכון
      // של generation ייעשה בסנכרון הבא. כאן רק משנים הורה.
      const { data: p } = await admin.from('lineage_nodes').select('generation').eq('id', s.parent_id).maybeSingle()
      const gen = ((p as { generation?: number } | null)?.generation ?? 0) + 1
      await admin.from('lineage_nodes').update({ parent_id: s.parent_id, generation: gen }).eq('id', s.node_id)
    } else if (s.kind === 'add_child' && s.parent_id && s.proposed_name) {
      const { data: p } = await admin.from('lineage_nodes').select('generation').eq('id', s.parent_id).maybeSingle()
      const gen = ((p as { generation?: number } | null)?.generation ?? 0) + 1
      await admin.from('lineage_nodes').insert({
        name: s.proposed_name, parent_id: s.parent_id, generation: gen,
        relation: s.relation ?? null, status: 'pending',
      })
    }
    // 'note' — אין שינוי בעץ, רק סימון כמטופל.

    await admin.from('lineage_review_suggestions').update({
      status: 'approved', resolved_at: new Date().toISOString(), resolved_by: staff.userId,
    }).eq('id', s.id)

    invalidateLineageCache()
    await logActivity(admin, {
      userId: staff.userId, action: 'lineage_suggestion_approved',
      entityType: 'lineage_node', entityId: s.node_id ?? s.parent_id ?? s.id,
      details: { kind: s.kind, name: s.proposed_name },
    }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בהחלת ההצעה' }, { status: 500 })
  }
}
