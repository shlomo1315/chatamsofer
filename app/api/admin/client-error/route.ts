import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// דיווח שגיאת צד-לקוח ליומן השרת.
//
// ⚠️ בלי זה, שגיאה שקורית בדפדפן היא בלתי-ניתנת לאבחון: המשתמש רואה "אירעה
// שגיאה בטעינת הנתונים", ביומן השרת אין דבר (העמוד נטען שם בהצלחה), ולא נותר
// אלא לנחש. הדיווח הופך שגיאה סמויה לשגיאה שאפשר לפתוח ולתקן.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // רק לאנשי צוות — אחרת זה ערוץ פתוח להצפת היומן מבחוץ
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ ok: false }, { status: 401 })

  let body: { message?: string; stack?: string; digest?: string; url?: string }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  // חיתוך: דיווח פגום לא אמור למלא את היומן
  const cut = (s: unknown, n: number) => String(s ?? '').slice(0, n)
  console.error(
    '[client-error]',
    JSON.stringify({
      user: staff.email ?? staff.userId,
      url: cut(body.url, 300),
      digest: cut(body.digest, 80),
      message: cut(body.message, 500),
      stack: cut(body.stack, 2000),
    }),
  )
  return NextResponse.json({ ok: true })
}
