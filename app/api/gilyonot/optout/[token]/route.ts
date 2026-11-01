import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { escHtml } from '@/lib/gilyonotMail'

// הסרה מכל הרשימות לנמען שקיבל את הגיליון מרשימה חיצונית (צאצאים, תורמים וכו').
// GET  — מסך אישור שמסביר שההסרה היא מכל הרשימות. לא מסיר מיד (סורקי אבטחה לוחצים על קישורים).
// POST — One-Click של Gmail (בלי confirm) או אישור מהמסך (?confirm=1).
// ⚠️ ציבורי בכוונה: האימות הוא טוקן המשלוח האקראי (uuid). ההסרה נרשמת בטבלה unsubscribes,
// שכבר מסוננת בשליחת גיליונות ובניוזלטר.
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function html(title: string, body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>${title}</title></head>
<body style="margin:0;font-family:'Heebo',Arial,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:36px;max-width:440px;width:100%;text-align:center;">
    <p style="margin:0 0 6px;color:#64748b;font-size:13px;">גיליונות החתם סופר</p>
    ${body}
  </div>
</body>
</html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

const invalid = () => html('קישור לא תקין', `<h1 style="margin:0 0 10px;color:#b91c1c;font-size:20px;">הקישור לא תקין</h1>
  <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">אפשר לפנות אלינו ונסיר אתכם ידנית.</p>`, 404)

async function findDelivery(token: string) {
  if (!UUID_RE.test(token)) return null
  const db = getServiceClient()
  if (!db) return null
  const { data } = await db.from('gilyonot_deliveries').select('id, email').eq('token', token).maybeSingle()
  return data ? { db, delivery: data as { id: string; email: string } } : null
}

export async function GET(_r: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await findDelivery(token)
  if (!found) return invalid()
  return html('הסרה מכל הרשימות', `<h1 style="margin:0 0 10px;color:#2563eb;font-size:20px;">להסיר אתכם מכל הרשימות?</h1>
    <p style="margin:0 0 12px;color:#64748b;font-size:14px;line-height:1.7;">הכתובת <strong dir="ltr" style="color:#334155;">${escHtml(found.delivery.email)}</strong> תוסר מ<strong>כל</strong> רשימות התפוצה שלנו.</p>
    <p style="margin:0 0 24px;color:#b45309;font-size:14px;line-height:1.7;background:#fffbeb;border-radius:10px;padding:12px;">שימו לב: ההסרה כוללת גם את כל ההטבות, החלוקות והעדכונים שנשלחים אליכם, ולא רק את הגיליון השבועי.</p>
    <form method="POST" action="/api/gilyonot/optout/${token}?confirm=1" style="margin:0;">
      <button type="submit" style="width:100%;background:#b91c1c;color:#fff;border:1.5px solid #b91c1c;border-radius:12px;padding:14px;font-size:15px;font-weight:bold;cursor:pointer;font-family:inherit;">כן, הסירו אותי מכל הרשימות</button>
    </form>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">לא רוצים להסיר? פשוט סגרו את החלון.</p>`)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const fromPage = new URL(request.url).searchParams.has('confirm')
  const found = await findDelivery(token)
  if (!found) return fromPage ? invalid() : NextResponse.json({ ok: false }, { status: 400 })
  const { db, delivery } = found
  const email = delivery.email.trim().toLowerCase()
  const now = new Date().toISOString()

  const { error } = await db.from('unsubscribes').upsert({ email, reason: 'user' }, { onConflict: 'email', ignoreDuplicates: true })
  if (error) {
    console.error('[gilyonot] הסרה מכל הרשימות נכשלה:', error.message)
    return fromPage ? html('אירעה שגיאה', '<h1 style="margin:0;color:#b91c1c;font-size:20px;">ההסרה נכשלה. נסו שוב.</h1>', 500) : NextResponse.json({ ok: false }, { status: 500 })
  }
  // אם הכתובת גם מנוי רשום, מסמנים אותו כמוסר; ושיוך ההסרה למשלוח לסטטיסטיקה
  await db.from('gilyonot_subscribers').update({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now }).eq('email', email).neq('status', 'unsubscribed')
  await db.from('gilyonot_deliveries').update({ unsubscribed_at: now }).eq('id', delivery.id).is('unsubscribed_at', null)

  if (!fromPage) return NextResponse.json({ ok: true })
  return html('הוסרתם מכל הרשימות', `<h1 style="margin:0 0 10px;color:#047857;font-size:20px;">הוסרתם מכל הרשימות</h1>
    <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">לא תקבלו עוד גיליונות, הטבות או חלוקות במייל. אפשר לפנות אלינו כדי לחזור.</p>`)
}
