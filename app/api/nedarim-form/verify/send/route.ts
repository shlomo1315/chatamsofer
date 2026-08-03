// טופס נדרים — שליחת קוד אימות לטלפון (שיחת ימות) או למייל.
// הלוגיקה המשותפת ב-lib/verifyChannel.ts. עטוף ב-CORS ל-matara.pro.
//
// ⚠️ עד כה הנקודה הזו קיבלה טלפון בלבד. המנגנון עצמו תמך במייל מהיום הראשון
// (אותו יצירת קוד, אותו hash, אותם תקרות) — רק הכתובת הזו חסמה אותו, כי הטופס
// של נדרים מולא בעמדות בלבד. עכשיו הטופס ממולא גם באתר, ושם המייל הוא הערוץ
// הנוח — ולכן החסימה הוסרה במקום לבנות מסלול שני שיצטרך להישאר מסונכרן.
import { type NextRequest } from 'next/server'
import { parseChannel, sendVerifyCode } from '@/lib/verifyChannel'
import { jsonCors, preflight } from '@/lib/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get('origin'))
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  let body: { channel?: string; value?: string; phone?: string; email?: string }
  try { body = await request.json() } catch { return jsonCors({ error: 'בקשה לא תקינה' }, { status: 400 }, origin) }

  // שלושה פורמטים נתמכים — כדי שהטופס לא יידרש לשנות את מה שכבר עובד:
  //   { phone: "05..." }                          ← טלפון, הפורמט הפשוט שנדרים שולחים
  //   { email: "a@b.com" }                        ← מייל, אותו סגנון
  //   { channel: "phone"|"email", value: "..." }  ← הפורמט המקורי
  const channel = parseChannel(body.channel) ?? (body.email ? 'email' : body.phone ? 'phone' : null)
  if (!channel) {
    return jsonCors({ error: 'יש לציין channel (phone/email) או שדה phone/email' }, { status: 400 }, origin)
  }

  const value = String(
    (channel === 'email' ? body.email : body.phone) ?? body.value ?? '',
  ).trim()
  if (!value) {
    return jsonCors(
      { error: channel === 'email' ? 'חסרה כתובת מייל' : 'חסר מספר טלפון' },
      { status: 400 },
      origin,
    )
  }

  const result = await sendVerifyCode(request, channel, value)
  return jsonCors(result.body, { status: result.status }, origin)
}
