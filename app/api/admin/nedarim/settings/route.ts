import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getNedarimCreds, saveNedarimCreds } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

// GET — מחזיר האם מוגדר + קוד מוסד (סיסמת ה-API לא נשלחת חזרה, רק חיווי שקיימת)
export async function GET() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const creds = await getNedarimCreds()
  return NextResponse.json(
    { configured: !!creds, mosadId: creds?.mosadId ?? '', hasApiPassword: !!creds?.apiPassword },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

// POST — שמירת קוד מוסד + קוד API
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  let body: { mosadId?: string; apiPassword?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const mosadId = (body.mosadId ?? '').trim()
  const apiPassword = (body.apiPassword ?? '').trim()
  if (!mosadId || !apiPassword) return NextResponse.json({ error: 'יש להזין קוד מוסד וקוד API' }, { status: 400 })
  if (!/^\d{4,9}$/.test(mosadId)) return NextResponse.json({ error: 'קוד מוסד אמור להיות מספר (עד 9 ספרות)' }, { status: 400 })
  const ok = await saveNedarimCreds({ mosadId, apiPassword })
  if (!ok) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
