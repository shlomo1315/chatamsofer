import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { buildCreditEmailHtml, creditSubject } from '@/lib/bookFairCredits'
import { creditCallConfigured, placeCreditCall } from '@/lib/yemotCreditCall'
import { deliverMail } from '@/lib/sendMail'
import { logActivity } from '@/lib/activityLog'

// שליחת הזיכויים: שיחת ימות ללקוחות הטלפון, מייל עם קישור אישי ללקוחות האתר.
// נשלח רק למי שעוד לא נשלח (או שהשליחה נכשלה); שליחה חוזרת למי ששלח כבר דורשת resend=true.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
const MAX_BATCH = 200

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const body = await request.json().catch(() => null) as { ids?: unknown; resend?: unknown } | null
  const ids = Array.isArray(body?.ids) ? body!.ids.filter((x): x is string => typeof x === 'string').slice(0, MAX_BATCH) : []
  if (!ids.length) return NextResponse.json({ error: 'לא נבחרו לקוחות' }, { status: 400 })
  const statuses = body?.resend === true ? ['pending', 'send_failed', 'sent', 'answered'] : ['pending', 'send_failed']

  const { data: rows, error } = await db.from('book_fair_credits')
    .select('id, customer_name, phone, email, channel, books, amount_agorot, token, status')
    .in('id', ids).in('status', statuses)
  if (error) return NextResponse.json({ error: 'טעינת הלקוחות נכשלה' }, { status: 422 })

  const hasPhone = (rows ?? []).some(r => r.channel === 'phone')
  if (hasPhone && !creditCallConfigured()) {
    return NextResponse.json({ error: 'שיחות ימות לא מוגדרות (חסר YEMOT_TOKEN או YEMOT_CREDIT_TEMPLATE_ID)' }, { status: 422 })
  }

  let sent = 0, failed = 0
  for (const r of rows ?? []) {
    let ok = false, err: string | undefined
    if (r.channel === 'phone') {
      const res = await placeCreditCall(r.phone!)
      ok = res.ok; err = res.error
    } else {
      const res = await deliverMail(r.email!, creditSubject, buildCreditEmailHtml({
        name: r.customer_name, books: r.books, amountAgorot: r.amount_agorot, url: `${SITE}/credit/${r.token}`,
      }), undefined, { transactional: true, department: 'book_fair' })
      ok = res.ok; err = res.error
    }
    await db.from('book_fair_credits').update(ok
      ? { status: r.status === 'pending' || r.status === 'send_failed' ? 'sent' : r.status, sent_at: new Date().toISOString(), send_error: null, updated_at: new Date().toISOString() }
      : { status: 'send_failed', send_error: (err ?? 'שגיאה').slice(0, 200), updated_at: new Date().toISOString() },
    ).eq('id', r.id)
    if (ok) sent++; else failed++
  }
  await logActivity(db, { userId: staff.userId, action: 'book_fair_credits_send', entityType: 'book_fair_credits', details: { sent, failed } })
  return NextResponse.json({ sent, failed, skipped: ids.length - (rows?.length ?? 0) })
}
