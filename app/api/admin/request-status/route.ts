import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requirePermission, forbidden } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const VALID: Record<string, string[]> = {
  loan: ['pending', 'inquiry', 'approved', 'active', 'completed', 'rejected', 'defaulted'],
  maternity: ['pending', 'active', 'completed', 'cancelled'],
}
// שדות נוספים מותרים לעדכון לכל סוג (whitelist — מונע עדכון עמודות לא צפויות)
const EXTRA_ALLOWED: Record<string, string[]> = {
  loan: ['approved_amount'],
  maternity: [],
}

// עדכון סטטוס בקשת הלוואה/לידה + תיעוד מי המזכיר שטיפל ומתי.
// מחליף עדכון ישיר מהקליינט כדי שהזיהוי (approved_by + activity_log) יקרה בשרת.
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  let body: { type?: string; id?: string; status?: string; extra?: Record<string, unknown> }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const type = String(body.type ?? '')
  const id = String(body.id ?? '')
  const status = String(body.status ?? '')
  if (!VALID[type]) return NextResponse.json({ error: 'סוג בקשה לא תקין' }, { status: 400 })
  const section = type === 'loan' ? 'loans' : 'maternity'
  if (!(await requirePermission(section, 'edit'))) return forbidden()
  if (!id || !VALID[type].includes(status)) return NextResponse.json({ error: 'פרמטרים חסרים או לא תקינים' }, { status: 400 })

  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const table = type === 'loan' ? 'loans' : 'maternity_aids'

  // הסטטוס הקודם — לתיעוד המעבר
  const { data: prev } = await admin.from(table).select('status').eq('id', id).maybeSingle()
  const fromStatus = (prev as { status?: string } | null)?.status ?? null

  // בניית העדכון: סטטוס + מי טיפל (approved_by) + שדות extra מותרים בלבד
  const update: Record<string, unknown> = {
    status,
    approved_by: staff.userId,
    updated_at: new Date().toISOString(),
  }
  const allowed = EXTRA_ALLOWED[type] ?? []
  for (const [k, v] of Object.entries(body.extra ?? {})) {
    if (allowed.includes(k)) update[k] = v
  }

  const { error } = await admin.from(table).update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // תיעוד הפעולה ברקע — לא מעכב את התגובה (כדי שהאישור יגיב מיידית)
  void logActivity(admin, {
    userId: staff.userId,
    action: `${type}_status_changed`,
    entityType: type === 'loan' ? 'loan' : 'maternity_aid',
    entityId: id,
    details: { from: fromStatus, to: status },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
