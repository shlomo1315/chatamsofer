import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getNedarimCreds, saveNedarimCreds, getMaternityLimitedId, saveMaternityLimitedId } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

// GET — מחזיר האם מוגדר + קוד מוסד + מזהה קבוצת הגבלת החנויות ליולדות (סיסמת ה-API לא נשלחת חזרה)
export async function GET() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const creds = await getNedarimCreds()
  const maternityLimitedId = await getMaternityLimitedId()
  return NextResponse.json(
    { configured: !!creds, mosadId: creds?.mosadId ?? '', hasApiPassword: !!creds?.apiPassword, maternityLimitedId },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

// POST — שמירת קוד מוסד + קוד API, ו/או מזהה קבוצת הגבלת החנויות ליולדות (כל שדה בנפרד)
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  let body: { mosadId?: string; apiPassword?: string; maternityLimitedId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const mosadId = (body.mosadId ?? '').trim()
  const apiPassword = (body.apiPassword ?? '').trim()
  const wantsCreds = mosadId !== '' || apiPassword !== ''
  const wantsLimitedId = body.maternityLimitedId !== undefined

  if (!wantsCreds && !wantsLimitedId) return NextResponse.json({ error: 'לא נשלחו נתונים לעדכון' }, { status: 400 })

  if (wantsCreds) {
    if (!mosadId || !apiPassword) return NextResponse.json({ error: 'יש להזין קוד מוסד וקוד API' }, { status: 400 })
    if (!/^\d{4,9}$/.test(mosadId)) return NextResponse.json({ error: 'קוד מוסד אמור להיות מספר (עד 9 ספרות)' }, { status: 400 })
    if (!(await saveNedarimCreds({ mosadId, apiPassword }))) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  }

  if (wantsLimitedId) {
    const limitedId = String(body.maternityLimitedId).trim()
    if (limitedId && !/^\d{1,10}$/.test(limitedId)) return NextResponse.json({ error: 'מזהה קבוצת הגבלת חנויות אמור להיות מספר' }, { status: 400 })
    if (!(await saveMaternityLimitedId(limitedId))) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
