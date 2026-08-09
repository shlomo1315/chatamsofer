import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { undoMergeBatch, recalcGenerations } from '@/lib/lineageMerge'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─────────────────────────────────────────────────────────────────────────────
// ביטול מיזוג.
//
// ⚠️ זה מה שהופך את העבודה לאפשרית בקצב אמיתי. בלי ביטול, כל הכרעה על זוג
// שמות דומים היא הימור בלתי הפיך — והמשתמש יישב על כל אחת מהן בחשש במקום
// לעבוד. עם אלפי מיזוגים לפניו, זה ההבדל בין כלי שמשרת אותו לכלי שמשתק אותו.
//
// GET  → רשימת המיזוגים האחרונים שניתן לבטל
// POST → ביטול אצווה שלמה (המיזוג וכל מה שנגרר ממנו במפל)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const { data } = await admin
    .from('lineage_merge_log')
    .select('batch_id, keep_id, merged_id, merged_node, source, created_at')
    .is('undone_at', null)
    .order('created_at', { ascending: false })
    .limit(300)

  // קיבוץ לאצוות — המשתמש מבטל אצווה, לא רשומה בודדת
  const byBatch = new Map<string, { batchId: string; at: string; count: number; names: string[]; keepId: string }>()
  for (const r of data ?? []) {
    const row = r as { batch_id: string; keep_id: string; merged_node: { name?: string }; created_at: string }
    const cur = byBatch.get(row.batch_id)
    const name = row.merged_node?.name ?? '—'
    if (cur) { cur.count++; if (cur.names.length < 4) cur.names.push(name) }
    else byBatch.set(row.batch_id, { batchId: row.batch_id, at: row.created_at, count: 1, names: [name], keepId: row.keep_id })
  }

  return NextResponse.json({ batches: [...byBatch.values()] })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  let body: { batchId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const batchId = String(body.batchId ?? '')
  if (!batchId) return NextResponse.json({ error: 'חסר מזהה אצווה' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  // ⚠️ הצומת שנשאר נקרא לפני הביטול — אחריו הוא כבר לא בהכרח שורש הענף,
  // וחישוב הדורות היה מתחיל מנקודה שגויה.
  const { data: first } = await admin.from('lineage_merge_log')
    .select('keep_id').eq('batch_id', batchId).is('undone_at', null).limit(1).maybeSingle()

  const restored = await undoMergeBatch(admin, batchId)
  if (!restored) return NextResponse.json({ error: 'לא נמצא מיזוג לביטול (ייתכן שכבר בוטל)' }, { status: 404 })

  const keepId = (first as { keep_id?: string } | null)?.keep_id
  if (keepId) await recalcGenerations(admin, keepId)

  await logActivity(admin, {
    userId: staff.userId,
    action: 'lineage_merge_undone',
    entityType: 'lineage_node', entityId: keepId ?? batchId,
    details: { batchId, restored },
  }).catch(() => {})

  // ⚠️ אותה תקלה כמו במיזוג עצמו: בלי פסילת המטמון הצמתים ששוחזרו לא
  // מופיעים חזרה במסך עד שה-TTL פג.
  invalidateLineageCache()

  return NextResponse.json({ ok: true, restored })
}
