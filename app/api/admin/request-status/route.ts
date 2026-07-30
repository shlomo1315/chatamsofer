import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requirePermission, forbidden } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { addBeneficiaryNote } from '@/lib/beneficiaryNotes'

export const dynamic = 'force-dynamic'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const VALID: Record<string, string[]> = {
  loan: ['pending', 'inquiry', 'approved', 'active', 'completed', 'rejected', 'defaulted'],
  maternity: ['pending', 'active', 'completed', 'cancelled', 'deep_review'],
}
// שדות נוספים מותרים לעדכון לכל סוג (whitelist — מונע עדכון עמודות לא צפויות)
const EXTRA_ALLOWED: Record<string, string[]> = {
  loan: ['approved_amount'],
  maternity: ['rejection_reason', 'deep_review_reason'],
}

// עדכון סטטוס בקשת הלוואה/לידה + תיעוד מי המזכיר שטיפל ומתי.
// מחליף עדכון ישיר מהקליינט כדי שהזיהוי (approved_by + activity_log) יקרה בשרת.
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  // note = תיעוד פנימי שאינו נשלח ליולדת; נכתב לתיעוד המשפחה לצד הסיבה שנשלחה
  let body: { type?: string; id?: string; status?: string; extra?: Record<string, unknown>; note?: string }
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

  // הסטטוס הקודם — לתיעוד המעבר. beneficiary_id נדרש כדי לכתוב לתיעוד המשפחה.
  const { data: prev } = await admin.from(table).select('status, beneficiary_id').eq('id', id).maybeSingle()
  const prevRow = prev as { status?: string; beneficiary_id?: string } | null
  const fromStatus = prevRow?.status ?? null

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

  // ─────────────────────────────────────────────────────────────────────────
  // תיעוד המשפחה — הסיבה שנשלחה ליולדת נשמרת גם ב"צ'אט" התיעוד שבראש הכרטסת.
  //
  // ⚠️ עד כה היא נשמרה רק ב-rejection_reason של אותו תיק לידה: הטקסט יצא
  // במייל ליולדת ונעלם מהתיעוד. חודשים אחר כך לא היה אפשר לענות על "למה
  // דחינו לה את הלידה" בלי לפתוח את התיק הספציפי ולחפש בו.
  // ─────────────────────────────────────────────────────────────────────────
  const reason = String((body.extra ?? {}).rejection_reason ?? (body.extra ?? {}).deep_review_reason ?? '').trim()
  const internalNote = String(body.note ?? '').trim()
  if (type === 'maternity' && prevRow?.beneficiary_id && (reason || internalNote)) {
    const heading = status === 'cancelled' ? '❌ בקשת לידה נדחתה'
      : status === 'deep_review' ? '🔍 הלידה הועברה לאישור המנהל'
      : 'עדכון סטטוס בקשת לידה'
    const lines = [heading]
    // ⚠️ מסומן במפורש מה נשלח ליולדת ומה פנימי — אחרת אי אפשר לדעת בדיעבד
    // מה היא ראתה, וזה בדיוק מה שנדרש כשמתקשרים אליה בחזרה.
    if (reason) lines.push(`הסיבה שנשלחה ליולדת: ${reason}`)
    if (internalNote) lines.push(`תיעוד פנימי (לא נשלח): ${internalNote}`)
    void addBeneficiaryNote(admin, {
      beneficiaryId: prevRow.beneficiary_id,
      body: lines.join('\n'),
      authorId: staff.userId,
    }).catch(() => {})
  }

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
