import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getDepartmentGates, getDepartmentOpenings, resolveGates, saveDepartmentGates, getDepartmentPreviewCode, regenerateDepartmentPreviewCode, GATED_DEPARTMENTS, DEFAULT_GATES, type DepartmentGates, type DepartmentOpenings } from '@/lib/departmentGates'

export const dynamic = 'force-dynamic'

// GET — מצב הפתיחה/סגירה של כל מחלקה. זמין לכל צוות (להצגה בממשק).
export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const admin = getServiceClient()
  const gates = await getDepartmentGates(admin ?? undefined)
  // ⚠️ קוד התצוגה המוקדמת מוחזר למנהל בלבד. הוא עוקף את שערי המחלקות,
  // ולכן חשיפתו לכל איש צוות שקולה לפתיחת המחלקות הסגורות עבורו.
  const previewCode = (await requireAdmin())
    ? await getDepartmentPreviewCode(admin ?? undefined)
    : undefined
  const { scheduled } = await getDepartmentOpenings(admin ?? undefined)
  return NextResponse.json({ gates, opensAt: scheduled, previewCode },{ headers: { 'Cache-Control': 'no-store' } })
}

// PUT — יצירת קוד תצוגה מוקדמת חדש (מבטל מיידית כל קישור שהופץ). מנהל בלבד.
export async function PUT() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const previewCode = await regenerateDepartmentPreviewCode(admin)
  if (!previewCode) return NextResponse.json({ error: 'יצירת הקוד נכשלה' }, { status: 500 })
  return NextResponse.json({ previewCode })
}

// POST — עדכון מצב המחלקות. מנהל בלבד (שינוי מהותי שמשפיע על כל המערכת הציבורית).
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { gates?: Record<string, unknown>; opens_at?: Record<string, unknown> }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  // מיזוג עם הקיים — מעדכן רק מחלקות שנשלחו, שאר הערכים נשמרים.
  // ⚠️ הקיים נקרא גולמי (בלי פתיחה אוטומטית שהגיע זמנה), כדי לא לשמור "פתוח" שהוא רק תוצאת חישוב.
  const { data: row } = await admin.from('app_settings').select('value').eq('key', 'department_gates').maybeSingle()
  const stored = resolveGates(row?.value ?? null, new Date(0))
  const next: DepartmentGates = { ...DEFAULT_GATES, ...stored.gates }
  const openings: DepartmentOpenings = { ...stored.scheduled }
  for (const d of GATED_DEPARTMENTS) {
    const v = body.gates?.[d]
    if (v === true || v === 'open') next[d] = true
    else if (v === false || v === 'closed') next[d] = false

    // תאריך פתיחה אוטומטית: מחרוזת תאריך תקינה = קביעה, null = ביטול
    const at = body.opens_at?.[d]
    if (at === null) delete openings[d]
    else if (typeof at === 'string') {
      const t = Date.parse(at)
      if (Number.isNaN(t)) return NextResponse.json({ error: 'תאריך פתיחה לא תקין' }, { status: 400 })
      openings[d] = new Date(t).toISOString()
    }
    // מחלקה פתוחה ידנית — אין תאריך פתיחה תלוי
    if (next[d]) delete openings[d]
  }

  if (!(await saveDepartmentGates(admin, next, openings))) {
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  }
  const resolved = resolveGates(JSON.stringify({ ...Object.fromEntries(GATED_DEPARTMENTS.map(d => [d, next[d] ? 'open' : 'closed'])), opens_at: openings }))
  return NextResponse.json({ ok: true, gates: resolved.gates, opensAt: resolved.scheduled })
}
