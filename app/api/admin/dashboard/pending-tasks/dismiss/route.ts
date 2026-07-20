import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, getServiceClient, forbidden } from '@/lib/apiAuth'

// הסתרת בקשה מלוח "ממתינים לטיפול" — רק מנהל מלא (admin). לא נוגע בנתונים עצמם:
// מוסיף שורה ל-dismissed_pending_tasks, וה-GET מסנן החוצה בקשות שהוסתרו.
export const dynamic = 'force-dynamic'

const VALID_TYPES = ['beneficiary', 'loan', 'maternity', 'widow', 'financial_aid']

export async function POST(request: NextRequest) {
  const staff = await requireAdmin()          // מנהל מלא בלבד
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let payload: { type?: string; id?: string }
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const type = String(payload.type ?? '')
  const id = String(payload.id ?? '')
  if (!VALID_TYPES.includes(type) || !id) {
    return NextResponse.json({ error: 'פרמטרים לא תקינים' }, { status: 400 })
  }

  const { error } = await db.from('dismissed_pending_tasks').upsert({
    entity_type: type,
    entity_id: id,
    dismissed_by: staff.userId ?? null,
    dismissed_at: new Date().toISOString(),
  }, { onConflict: 'entity_type,entity_id' })

  if (error) {
    console.error('[pending-tasks/dismiss] failed:', error.message)
    return NextResponse.json({ error: 'ההסתרה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
