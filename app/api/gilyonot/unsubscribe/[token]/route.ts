import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { escHtml } from '@/lib/gilyonotMail'

// הסרה מרשימת התפוצה של הגיליון השבועי.
// GET  — קישור בפוטר המייל: מסך אישור, לא מסיר מיד (סורקי אבטחה לוחצים על קישורים).
// POST — One-Click של Gmail (בלי confirm) או אישור מהמסך (?confirm=1).
// ⚠️ ציבורי בכוונה: האימות הוא הטוקן האקראי (uuid) של הנמען, בטבלה שרק service_role ניגש אליה.
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

const button = (label: string, color: string, filled: boolean) =>
  `style="width:100%;background:${filled ? color : '#fff'};color:${filled ? '#fff' : color};border:1.5px solid ${color};border-radius:12px;padding:14px;font-size:15px;font-weight:bold;cursor:pointer;font-family:inherit;">${label}`

const invalid = () => html('קישור לא תקין', `<h1 style="margin:0 0 10px;color:#b91c1c;font-size:20px;">הקישור לא תקין</h1>
  <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">אפשר לפנות אלינו ונסיר אתכם ידנית.</p>`, 404)

async function findSubscriber(token: string) {
  if (!UUID_RE.test(token)) return null
  const db = getServiceClient()
  if (!db) return null
  const { data } = await db.from('gilyonot_subscribers').select('id, email, status').eq('token', token).maybeSingle()
  return data ? { db, sub: data as { id: string; email: string; status: string } } : null
}

function removedPage(token: string) {
  return html('הוסרתם מרשימת התפוצה', `<h1 style="margin:0 0 10px;color:#047857;font-size:20px;">הוסרתם מרשימת התפוצה</h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.7;">לא תקבלו עוד את הגיליון השבועי במייל.</p>
    <form method="POST" action="/api/gilyonot/unsubscribe/${token}?resubscribe=1" style="margin:0;">
      <button type="submit" ${button('הסרתי בטעות, החזירו אותי', '#2563eb', false)}</button>
    </form>`)
}

export async function GET(_r: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await findSubscriber(token)
  if (!found) return invalid()
  if (found.sub.status === 'unsubscribed') return removedPage(token)
  return html('הסרה מרשימת התפוצה', `<h1 style="margin:0 0 10px;color:#2563eb;font-size:20px;">להסיר אתכם מקבלת הגיליון?</h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.7;">הכתובת <strong dir="ltr" style="color:#334155;">${escHtml(found.sub.email)}</strong> לא תקבל עוד את הגיליון השבועי.</p>
    <form method="POST" action="/api/gilyonot/unsubscribe/${token}?confirm=1" style="margin:0;">
      <button type="submit" ${button('כן, הסירו אותי', '#b91c1c', true)}</button>
    </form>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">לא רוצים להסיר? פשוט סגרו את החלון.</p>`)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const url = new URL(request.url)
  const found = await findSubscriber(token)
  const fromPage = url.searchParams.has('confirm') || url.searchParams.has('resubscribe')
  if (!found) return fromPage ? invalid() : NextResponse.json({ ok: false }, { status: 400 })
  const { db, sub } = found
  const now = new Date().toISOString()

  if (url.searchParams.get('resubscribe') === '1') {
    const { error } = await db.from('gilyonot_subscribers')
      .update({ status: 'active', unsubscribed_at: null, consent_at: now, updated_at: now }).eq('id', sub.id)
    if (error) return html('אירעה שגיאה', '<h1 style="margin:0;color:#b91c1c;font-size:20px;">לא הצלחנו להחזיר אתכם. נסו שוב.</h1>', 500)
    return html('חזרתם לרשימת התפוצה', `<h1 style="margin:0 0 10px;color:#047857;font-size:20px;">חזרתם לרשימת התפוצה</h1>
      <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">הגיליון הבא יישלח אליכם כרגיל.</p>`)
  }

  if (sub.status !== 'unsubscribed') {
    const { error } = await db.from('gilyonot_subscribers')
      .update({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now }).eq('id', sub.id)
    if (error) {
      console.error('[gilyonot] הסרה נכשלה:', error.message)
      return fromPage ? html('אירעה שגיאה', '<h1 style="margin:0;color:#b91c1c;font-size:20px;">ההסרה נכשלה. נסו שוב.</h1>', 500) : NextResponse.json({ ok: false }, { status: 500 })
    }
  }
  return fromPage ? removedPage(token) : NextResponse.json({ ok: true })
}
