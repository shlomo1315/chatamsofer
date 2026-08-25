import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// רשימת הנרשמים המלאה — נטענת ברקע אחרי שהמסך כבר מוצג.
//
// 🔴 מסך החלוקה המתין ל-4.8MB לפני שהציג שורה אחת: 6,047 נרשמים עם כל
// פרטי המשפחה, כדי להראות 50. המסד עצמו לוקח 25ms — הזמן כולו הוא
// העברת המטען ורינדורו בשרת. התוצאה: ~7 שניות מסך ריק.
//
// ⚠️ הרשימה המלאה עדיין נדרשת — לחיפוש על כל הרשומות, לפילוחים,
// לפעולות מרוכזות ולייצוא לאקסל. לכן היא נטענת, אך *אחרי* שהמסך חי
// ולא לפניו.
//
// ⚠️ אותה מחרוזת select בדיוק כמו בעמוד, כולל הנפילה-לאחור על תווית
// האישור: שתי צורות שונות היו מחזירות שורות שונות, והמסך היה משתנה
// ברגע שהרקע מסיים.
//
// 🔒 צוות בלבד.
// ─────────────────────────────────────────────────────────────────────────────

const SELECT_WITH_LABEL =
  'id, source, registered_at, phone, notified_at, amount, beneficiary_id, approval_status, approved_at, card_number, card_linked_at, card_link_error, notify_error, center_id, center_source, load_status, center:holiday_centers(id, city, name), beneficiary:beneficiaries(id, full_name, family_name, spouse_name, id_number, phone, phone2, email, address, city, community_affiliation, children_count, birth_date, spouse_birth_date, approval_label:approval_labels(id, name, color, notes))'

const SELECT_PLAIN =
  'id, source, registered_at, phone, notified_at, amount, beneficiary_id, approval_status, approved_at, card_number, card_linked_at, card_link_error, notify_error, center_id, center_source, load_status, center:holiday_centers(id, city, name), beneficiary:beneficiaries(id, full_name, family_name, spouse_name, id_number, phone, phone2, email, address, city, community_affiliation, children_count, birth_date, spouse_birth_date)'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireStaff())) return forbidden()

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ offset מאפשר לדלג על מה שכבר נשלח בטעינה הראשונה של העמוד —
  // אחרת 50 השורות הראשונות עוברות פעמיים.
  const url = new URL(_request.url)
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0)

  // ⚠️ שתי פונקציות מפורשות ולא select כמשתנה: הטיפוסים של supabase-js
  // נגזרים מהמחרוזת *הליטרלית*, ומשתנה מבטל את ההסקה. אותו שיקול בדיוק
  // כמו בעמוד עצמו.
  const loadWithLabel = () => fetchAllRows<Record<string, unknown>>((from, to) => db
    .from('distribution_recipients')
    .select(SELECT_WITH_LABEL)
    .eq('distribution_id', id)
    .order('registered_at', { ascending: false })
    .range(offset + from, offset + to))

  const loadPlain = () => fetchAllRows<Record<string, unknown>>((from, to) => db
    .from('distribution_recipients')
    .select(SELECT_PLAIN)
    .eq('distribution_id', id)
    .order('registered_at', { ascending: false })
    .range(offset + from, offset + to))

  // ⚠️ נפילה-לאחור על תווית האישור: ה-join אינו קיים עד שהמיגרציה של
  // approval_labels רצה, ובלעדיה כל הבקשה הייתה נכשלת.
  let res = await loadWithLabel()
  if (res.error) {
    console.error(`[distributions/${id}/rows] label join failed, retrying without:`, res.error)
    res = await loadPlain()
  }
  if (res.error) {
    return NextResponse.json({ error: res.error }, { status: 500 })
  }

  return NextResponse.json({ rows: res.rows }, { headers: { 'Cache-Control': 'no-store' } })
}
