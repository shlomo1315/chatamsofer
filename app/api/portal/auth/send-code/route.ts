import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { generateCode, hashCode, maskEmail } from '@/lib/portalPassword'
import { normalizeId } from '@/lib/portalBeneficiary'
import { deliverMail } from '@/lib/sendMail'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function codeEmailHtml(code: string): string {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/></head>
  <body style="direction:rtl;text-align:right;font-family:Arial,sans-serif;background:#f1f5f9;padding:24px;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:#4f46e5;color:#fff;padding:20px 24px;font-size:18px;font-weight:700;">היכל החתם סופר — אזור אישי</div>
      <div style="padding:24px;color:#1e293b;font-size:15px;line-height:1.7;">
        <p style="margin:0 0 12px;">קוד האימות שלך לכניסה / הגדרת סיסמה:</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#4f46e5;text-align:center;background:#eef2ff;border-radius:12px;padding:16px 0;margin:8px 0 16px;">${code}</div>
        <p style="margin:0 0 8px;">הקוד תקף ל-<strong>10 דקות</strong>.</p>
        <p style="margin:0;color:#64748b;font-size:13px;">אם לא ביקשת קוד זה, ניתן להתעלם מהודעה זו.</p>
      </div>
    </div>
  </body></html>`
}

// "שכחתי סיסמה" / הגדרת סיסמה ראשונה: שולח קוד חד-פעמי בן 6 ספרות, תקף 10 דקות,
// למייל הרשום של המוטב.
export async function POST(request: NextRequest) {
  if (!rateLimit(`portal-code:${clientIp(request)}`, 8, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב בעוד מספר דקות.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const idNumber = normalizeId(body.idType, body.id)
  if (!idNumber || idNumber.length < 5) {
    return NextResponse.json({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 })
  }
  // הגבלת קצב לפי מזהה — מונע הצפת מייל של משתמש אחר
  if (!rateLimit(`portal-code-id:${idNumber}`, 4, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'כבר נשלח קוד לאחרונה. בדוק את תיבת המייל או נסה שוב בעוד מספר דקות.' }, { status: 429 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data } = await admin
    .from('beneficiaries')
    .select('id, email')
    .eq('id_number', idNumber)
    .maybeSingle()

  // לא חושפים אם הת"ז קיימת; אך אם אין מייל אין לאן לשלוח.
  if (!data) {
    return NextResponse.json({ ok: true, sent: false, hasEmail: false })
  }
  if (!data.email) {
    return NextResponse.json({ error: 'לא קיימת כתובת מייל במערכת עבור משתמש זה. אנא פנה למשרד להגדרת מייל.' }, { status: 400 })
  }

  const code = generateCode()
  const codeHash = await hashCode(code)
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const { error: upErr } = await admin
    .from('beneficiaries')
    .update({ portal_reset_code_hash: codeHash, portal_reset_expires: expires, portal_reset_attempts: 0 })
    .eq('id', data.id)
  if (upErr) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const mail = await deliverMail(data.email, 'קוד אימות — אזור אישי היכל החתם סופר', codeEmailHtml(code))
  if (!mail.ok) return NextResponse.json({ error: 'שליחת המייל נכשלה. נסה שוב מאוחר יותר.' }, { status: 502 })

  return NextResponse.json({ ok: true, sent: true, hasEmail: true, emailHint: maskEmail(data.email) })
}
