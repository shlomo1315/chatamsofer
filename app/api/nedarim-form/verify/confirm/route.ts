// טופס נדרים — אימות הקוד (טלפון או מייל). בהצלחה מחזיר טוקן חתום (30 דק')
// שיצורף בבקשת ההרשמה. הלוגיקה המשותפת ב-lib/verifyChannel.ts. CORS ל-matara.pro.
import { type NextRequest } from 'next/server'
import { parseChannel, confirmVerifyCode } from '@/lib/verifyChannel'
import { jsonCors, preflight } from '@/lib/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get('origin'))
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  let body: { channel?: string; value?: string; phone?: string; email?: string; code?: string }
  try { body = await request.json() } catch { return jsonCors({ error: 'בקשה לא תקינה' }, { status: 400 }, origin) }

  // אותם שלושה פורמטים כמו ב-verify/send.
  const channel = parseChannel(body.channel) ?? (body.email ? 'email' : body.phone ? 'phone' : null)
  if (!channel) {
    return jsonCors({ error: 'יש לציין channel (phone/email) או שדה phone/email' }, { status: 400 }, origin)
  }

  const raw = String((channel === 'email' ? body.email : body.phone) ?? body.value ?? '').trim()
  const code = String(body.code ?? '').replace(/\D/g, '')
  if (!raw) {
    return jsonCors(
      { error: channel === 'email' ? 'חסרה כתובת מייל' : 'חסר מספר טלפון' },
      { status: 400 },
      origin,
    )
  }
  if (!code) return jsonCors({ error: 'חסר קוד אימות' }, { status: 400 }, origin)

  const result = await confirmVerifyCode(request, channel, raw, code)
  return jsonCors(result.body, { status: result.status }, origin)
}
