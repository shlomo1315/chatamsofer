// טופס נדרים — שליחת קוד אימות לטלפון (שיחת ימות). טלפון בלבד; מייל אינו נאמת
// בזרימה זו. הלוגיקה המשותפת ב-lib/verifyChannel.ts. עטוף ב-CORS ל-matara.pro.
import { type NextRequest } from 'next/server'
import { sendVerifyCode } from '@/lib/verifyChannel'
import { jsonCors, preflight } from '@/lib/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get('origin'))
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  let body: { channel?: string; value?: string; phone?: string }
  try { body = await request.json() } catch { return jsonCors({ error: 'בקשה לא תקינה' }, { status: 400 }, origin) }

  // שני פורמטים נתמכים:
  //   { phone: "05..." }                    ← הפשוט, מה שנדרים פלוס שולחים
  //   { channel: "phone", value: "05..." }  ← הפורמט המקורי, לתאימות לאחור
  // בזרימה זו מאמתים טלפון בלבד (מייל אינו נאמת כאן).
  const phone = String(body.phone ?? body.value ?? '').trim()

  if (body.channel && body.channel !== 'phone') {
    return jsonCors({ error: 'אימות טלפון בלבד נתמך בטופס זה' }, { status: 400 }, origin)
  }
  if (!phone) {
    return jsonCors({ error: 'חסר מספר טלפון' }, { status: 400 }, origin)
  }

  const result = await sendVerifyCode(request, 'phone', phone)
  return jsonCors(result.body, { status: result.status }, origin)
}
