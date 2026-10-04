import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { emailError, cleanEmail } from '@/lib/emailAddress'

// מיילים של היריד — צפייה ושליחה.
//
// ⚠️ מסנן department='yerid' ולא לפי נמען: המטרה היא לראות את מה
// שהמחלקה שלחה, ולא כל מייל שיצא במקרה ללקוח של היריד.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PAGE = 50

export async function GET(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'view')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''

  let query = db.from('sent_emails')
    // ⚠️ אין ב-sent_emails עמודות status/error: נרשם בה רק מייל שיצא
    // בהצלחה. בחירתן הפילה את כל המסך ("column does not exist").
    .select('id, to_email, subject, sent_at')
    .eq('department', 'yerid')
    .order('sent_at', { ascending: false })
    .limit(PAGE)

  if (q) {
    // ⚠️ ניקוי תווי wildcard: '%' בחיפוש היה מחזיר את כל השורות.
    const s = q.replace(/[%_\\]/g, '')
    query = query.or(`subject.ilike.%${s}%,to_email.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) {
    console.error('[book-fair/emails] fetch failed:', error.message)
    return NextResponse.json({ error: 'טעינת המיילים נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ emails: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

/** שליחת מייל חופשי מכתובת היריד. */
export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  let body: { to?: string; subject?: string; text?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const to = cleanEmail(String(body.to ?? ''))
  const subject = String(body.subject ?? '').trim()
  const text = String(body.text ?? '').trim()

  const bad = emailError(to)
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })
  if (!subject) return NextResponse.json({ error: 'יש להזין נושא' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'יש להזין תוכן' }, { status: 400 })

  // ⚠️ הטקסט מנוטרל ומומר לפסקאות: הוא מוקלד ביד ונשלח כ-HTML,
  // ותו '<' בודד היה שובר את המייל אצל הנמען.
  const esc = (s: string) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `
    <div dir="rtl" style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.8;color:#0f172a">
      ${text.split('\n').map(l => `<p style="margin:0 0 10px">${esc(l) || '&nbsp;'}</p>`).join('')}
      <p style="margin:18px 0 0;color:#94a3b8;font-size:13px">יריד הספרים · היכל החתם סופר</p>
    </div>`

  const sent = await deliverMail(to, subject, html, undefined, {
    ...mailFor('yerid'),
    // ⚠️ transactional: זהו מייל יזום לנמען בודד ולא דיוור — בלי
    // מעקב פתיחות ובלי List-Unsubscribe, שרק פוגעים במסירה.
    transactional: true,
  })

  if (!sent.ok) {
    return NextResponse.json({ error: sent.error ?? 'השליחה נכשלה' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
