// בדיקת שיחת הודעת הרישום — admin מזין מספר (שלו) והמערכת מבצעת שיחה אחת
// ומחזירה את התוצאה (הצלחה או שגיאה) לאבחון. שיחה בודדת למספר שנמסר בלבד.
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { placeTtsCall, phoneCallConfigured } from '@/lib/phoneCall'
import { getRegistrationCallText } from '@/lib/registrationCallMessage'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  if (!phoneCallConfigured()) return NextResponse.json({ error: 'שיחות יוצאות בטכנוליין לא מוגדרות (חסר TECHNOLINE_MAIN_API_KEY או TECHNOLINE_OUTBOUND_ENABLED).' }, { status: 503 })

  let body: { phone?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const phone = String(body.phone ?? '').trim()
  if (phone.replace(/\D/g, '').length < 9) return NextResponse.json({ error: 'מספר טלפון לא תקין' }, { status: 400 })

  const text = await getRegistrationCallText()
  const r = await placeTtsCall(phone, text)
  return NextResponse.json({
    ok: r.ok,
    error: r.error ?? null,
    notConfigured: !!r.notConfigured,
  })
}
