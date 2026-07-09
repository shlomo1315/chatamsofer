// אימות הקוד שנשלח (verify/send). בהצלחה מחזיר אסימון חתום המוכיח שהערוץ אומת.
// הלוגיקה המלאה ב-lib/verifyChannel.ts (משותפת עם טופס נדרים).
import { NextResponse, type NextRequest } from 'next/server'
import { parseChannel, confirmVerifyCode } from '@/lib/verifyChannel'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let body: { channel?: string; value?: string; code?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const channel = parseChannel(body.channel)
  const raw = String(body.value ?? '').trim()
  const code = String(body.code ?? '').replace(/\D/g, '')
  if (!channel || !raw || !code) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })

  const result = await confirmVerifyCode(request, channel, raw, code)
  return NextResponse.json(result.body, { status: result.status })
}
