// טופס נדרים — אימות קוד הטלפון. בהצלחה מחזיר טוקן חתום (30 דק') שיצורף בשמירה.
// הלוגיקה המשותפת ב-lib/verifyChannel.ts. עטוף ב-CORS ל-matara.pro.
import { type NextRequest } from 'next/server'
import { confirmVerifyCode } from '@/lib/verifyChannel'
import { jsonCors, preflight } from '@/lib/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get('origin'))
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  let body: { channel?: string; value?: string; code?: string }
  try { body = await request.json() } catch { return jsonCors({ error: 'בקשה לא תקינה' }, { status: 400 }, origin) }

  if (body.channel !== 'phone') {
    return jsonCors({ error: 'אימות טלפון בלבד נתמך בטופס זה' }, { status: 400 }, origin)
  }
  const raw = String(body.value ?? '').trim()
  const code = String(body.code ?? '').replace(/\D/g, '')
  if (!raw || !code) return jsonCors({ error: 'חסרים פרטים' }, { status: 400 }, origin)

  const result = await confirmVerifyCode(request, 'phone', raw, code)
  return jsonCors(result.body, { status: result.status }, origin)
}
