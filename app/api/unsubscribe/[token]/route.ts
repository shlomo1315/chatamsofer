import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken, addUnsubscribe } from '@/lib/unsubscribe'

// הסרה מרשימת תפוצה.
//
// POST — One-Click unsubscribe (Gmail שולח POST אוטומטית כשלוחצים "בטל מנוי")
// GET  — לחיצה על הקישור בפוטר המייל
//
// שים לב: אין requireStaff — זו נקודת קצה ציבורית בכוונה. האימות הוא
// הטוקן החתום, שמונע הסרה של כתובת אחרת.
export const dynamic = 'force-dynamic'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function page(title: string, message: string, ok: boolean): NextResponse {
  const color = ok ? '#059669' : '#dc2626'
  return new NextResponse(
    `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
</head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:40px;max-width:420px;text-align:center;">
    <div style="font-size:40px;margin-bottom:12px;">${ok ? '✓' : '⚠'}</div>
    <h1 style="margin:0 0 10px;color:${color};font-size:20px;">${title}</h1>
    <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">${message}</p>
  </div>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

async function unsubscribe(token: string): Promise<boolean> {
  const parsed = verifyUnsubscribeToken(token)
  if (!parsed) return false

  const db = admin()
  if (!db) return false

  await addUnsubscribe(db, parsed.email, 'user', parsed.campaignId)
  return true
}

// One-Click — Gmail/Apple שולחים POST ומצפים ל-200 ריק
export async function POST(_r: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ok = await unsubscribe(token)
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 })
}

// לחיצה על הקישור בפוטר
export async function GET(_r: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ok = await unsubscribe(token)

  return ok
    ? page(
        'הוסרת מרשימת התפוצה',
        'לא תקבלו מאיתנו עוד מיילים פרסומיים.<br/>מיילים הקשורים לבקשות שהגשתם ימשיכו להישלח כרגיל.',
        true,
      )
    : page(
        'הקישור אינו תקין',
        'ייתכן שהקישור פג או שאינו שלם. אפשר לפנות אלינו ישירות ונסיר אתכם ידנית.',
        false,
      )
}
