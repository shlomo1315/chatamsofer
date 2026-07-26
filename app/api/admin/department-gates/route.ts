import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getDepartmentGates, saveDepartmentGates, GATED_DEPARTMENTS, DEFAULT_GATES, type DepartmentGates } from '@/lib/departmentGates'

export const dynamic = 'force-dynamic'

// GET — מצב הפתיחה/סגירה של כל מחלקה. זמין לכל צוות (להצגה בממשק).
export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const admin = getServiceClient()
  const gates = await getDepartmentGates(admin ?? undefined)
  return NextResponse.json({ gates }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST — עדכון מצב המחלקות. מנהל בלבד (שינוי מהותי שמשפיע על כל המערכת הציבורית).
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { gates?: Record<string, unknown> }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  // מיזוג עם הקיים — מעדכן רק מחלקות שנשלחו, שאר הערכים נשמרים.
  const current = await getDepartmentGates(admin)
  const next: DepartmentGates = { ...DEFAULT_GATES, ...current }
  for (const d of GATED_DEPARTMENTS) {
    const v = body.gates?.[d]
    if (v === true || v === 'open') next[d] = true
    else if (v === false || v === 'closed') next[d] = false
  }

  if (!(await saveDepartmentGates(admin, next))) {
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, gates: next })
}
