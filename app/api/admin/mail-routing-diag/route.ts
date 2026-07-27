import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { departmentByEmail } from '@/lib/departments'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אבחון ניתוב מיילים — למה "מיילים מתערבבים". מציג ל-30 המיילים האחרונים את
// הנמען שנשמר (to_email), המחלקה (department), והאם הם תואמים. מזהה מיילים
// שנותבו למחלקה שאינה תואמת לכתובת הנמען שלהם. קריאה-בלבד, מנהל בלבד.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await admin
    .from('inbound_emails')
    .select('id, from_email, to_email, department, subject, created_at')
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map(m => {
    // מה המחלקה *צריכה* להיות לפי כתובת הנמען שנשמרה
    const expectedDept = m.to_email ? departmentByEmail(String(m.to_email))?.key ?? null : null
    // חוסר התאמה: המחלקה השמורה שונה ממה שנגזר מכתובת הנמען
    const mismatch = expectedDept != null && m.department != null && String(m.department) !== expectedDept
    return {
      id: m.id,
      from: m.from_email,
      to_email: m.to_email || '(ריק!)',
      department: m.department || '(ריק!)',
      expectedByToEmail: expectedDept || '(לא מזוהה)',
      mismatch,
      subject: String(m.subject ?? '').slice(0, 50),
      at: m.created_at,
    }
  })

  return NextResponse.json({
    total: rows.length,
    mismatchCount: rows.filter(r => r.mismatch).length,
    emptyToEmail: rows.filter(r => r.to_email === '(ריק!)').length,
    note: 'mismatch=true → המייל נשמר במחלקה שאינה תואמת לכתובת הנמען. to_email ריק → הניתוב לא זיהה נמען.',
    rows,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
