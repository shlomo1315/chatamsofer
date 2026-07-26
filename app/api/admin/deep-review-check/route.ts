import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אבחון: האם שתי המיגרציות של "בדיקה מעמיקה" נתפסו במסד —
//   (1) הסטטוס deep_review מותר ב-check constraint,
//   (2) העמודה deep_review_reason קיימת.
// בודק בפועל: קורא את העמודה ומנסה עדכון-יבש (dry) על שורה לא קיימת כדי
// לראות אם ה-constraint מקבל את הערך. קריאה-בלבד, מנהל בלבד.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const out: Record<string, unknown> = {}

  // 1) העמודה deep_review_reason קיימת? — select עליה ייכשל אם חסרה.
  try {
    const { error } = await admin.from('beneficiaries').select('id, deep_review_reason').limit(1)
    out.reasonColumn = error ? { ok: false, error: error.message } : { ok: true }
  } catch (e) {
    out.reasonColumn = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  // 2) ה-constraint מקבל deep_review? — update על id שאינו קיים: אם הערך
  //    חוקי, נקבל 0 שורות (הצלחה בלי שינוי). אם ה-constraint חוסם, נקבל
  //    שגיאת check constraint. משתמשים ב-id דמה שלא קיים כדי לא לשנות דבר.
  try {
    const FAKE_ID = '00000000-0000-0000-0000-000000000000'
    const { error } = await admin.from('beneficiaries')
      .update({ eligibility_status: 'deep_review' })
      .eq('id', FAKE_ID)
    // שגיאת check = הערך לא מותר; אין שגיאה = מותר (0 שורות עודכנו)
    out.constraintAllows = error
      ? { ok: !/check constraint|violates/i.test(error.message), error: error.message }
      : { ok: true }
  } catch (e) {
    out.constraintAllows = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  const reasonOk = (out.reasonColumn as { ok?: boolean })?.ok === true
  const constraintOk = (out.constraintAllows as { ok?: boolean })?.ok === true
  return NextResponse.json({
    ready: reasonOk && constraintOk,
    summary: reasonOk && constraintOk
      ? 'שתי המיגרציות נתפסו — בדיקה מעמיקה תעבוד'
      : 'חסרה מיגרציה — ראה פירוט למטה',
    ...out,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
