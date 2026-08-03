import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, forbidden } from '@/lib/apiAuth'
import { runUnloadUnapproved } from '@/lib/unloadExpired'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ביטול כל הטעינות של לידות שאינן מאושרות — בלחיצה אחת.
//
// ⚠️ הכלל הוא שביטול אישור מבטל את הטעינה, אבל טעינות שנוצרו לפני שהכלל נאכף
// נשארו חיות: משפחה שאינה מאושרת מחזיקה 600 ₪, וכרטיס חסר במלאי בלי הסבר.
// הפעולה הזו מיישרת את המצב הקיים — פורקת את הכסף, מנתקת את הכרטיס המגנטי,
// מחזירה את הכרטיס למלאי ושולחת מייל תיקון. אותה סריקה רצה גם כל שעה כרשת
// ביטחון, כך שהפער לא יכול לחזור ולהצטבר.
//
// מנהל בלבד: פעולה קבוצתית שנוגעת בכסף אמיתי ובשליחת מיילים.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()

  let body: { notify?: boolean } = {}
  try { body = await request.json() } catch { /* גוף ריק = ברירת מחדל */ }

  const res = await runUnloadUnapproved({ notify: body.notify !== false })
  if (!res.ok) return NextResponse.json({ error: res.error ?? 'הפעולה נכשלה' }, { status: 502 })
  return NextResponse.json(res)
}
