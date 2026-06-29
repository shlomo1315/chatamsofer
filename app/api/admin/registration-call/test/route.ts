// בדיקת שיחת הודעת הרישום — admin מזין מספר (שלו) והמערכת מבצעת שיחה אחת
// ומחזירה את התוצאה (file/tts + שגיאה) לאבחון. שיחה בודדת למספר שנמסר בלבד.
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { placeAnnouncementCall, yemotCallConfigured } from '@/lib/yemotCall'
import { getRegistrationCallText } from '@/lib/registrationCallMessage'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  if (!yemotCallConfigured()) return NextResponse.json({ error: 'שיחות ימות אינן מוגדרות (YEMOT_TOKEN / YEMOT_OTP_TEMPLATE_ID).' }, { status: 503 })

  let body: { phone?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const phone = String(body.phone ?? '').trim()
  if (phone.replace(/\D/g, '').length < 9) return NextResponse.json({ error: 'מספר טלפון לא תקין' }, { status: 400 })

  const text = await getRegistrationCallText()
  const r = await placeAnnouncementCall(phone, text)
  return NextResponse.json({
    ok: r.ok,
    mode: r.mode ?? null,            // 'file' = קמפיין ההקלטה · 'tts' = הקראת טקסט
    announceTemplate: process.env.YEMOT_ANNOUNCE_TEMPLATE_ID ?? null,
    error: r.error ?? null,
    notConfigured: !!r.notConfigured,
  })
}
