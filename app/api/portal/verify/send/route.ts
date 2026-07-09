// שליחת קוד אימות חד-פעמי למייל או לטלפון (ברישום ובעריכת פרטים).
// הלוגיקה המלאה ב-lib/verifyChannel.ts (משותפת עם טופס נדרים).
import { NextResponse, type NextRequest } from 'next/server'
import { parseChannel, sendVerifyCode } from '@/lib/verifyChannel'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let body: { channel?: string; value?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const channel = parseChannel(body.channel)
  if (!channel) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })

  const result = await sendVerifyCode(request, channel, String(body.value ?? ''))
  return NextResponse.json(result.body, { status: result.status })
}
