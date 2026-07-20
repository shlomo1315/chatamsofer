import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { buildGratitudeVoucher } from '@/lib/gratitudeVoucher'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { loadGratitudeLetter, voucherInputFromRow, donorEmailHtml, DONOR_EMAIL_SUBJECT } from '../[id]/shared'

// שליחה מרוכזת של מכתבי ברכה לנדיב — כל מכתב נבנה כ-PDF ונשלח בנפרד לכתובת שנבחרה.
// מדלג על מכתבים שכבר נשלחו לאותה כתובת (אלא אם force). מסמן sent_to_donor_at לכל שנשלח.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export async function POST(request: NextRequest) {
  const ctx = await requirePermission('maternity', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let payload: { ids?: unknown; email?: string; force?: boolean }
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const email = (payload.email ?? '').trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  }
  const ids = Array.isArray(payload.ids) ? payload.ids.filter((x): x is string => typeof x === 'string') : []
  if (!ids.length) return NextResponse.json({ error: 'לא נבחרו מכתבי ברכה' }, { status: 400 })

  const { fromEmail, fromName, replyTo } = mailFor('maternity')

  let sent = 0, skipped = 0, failed = 0
  const sentAt = new Date().toISOString()

  for (const id of ids) {
    try {
      const row = await loadGratitudeLetter(db, id)
      if (!row || row.status !== 'approved') { skipped++; continue }
      // כבר נשלח לאותה כתובת — מדלגים (אלא אם המשתמש ביקש שליחה חוזרת)
      if (!payload.force && row.sent_to_donor_at && (row.sent_to_donor_email ?? '') === email) { skipped++; continue }

      const voucher = await buildGratitudeVoucher(voucherInputFromRow(row))
      const html = donorEmailHtml(row)
      const result = await deliverMail(email, DONOR_EMAIL_SUBJECT, html, [voucher], { fromEmail, fromName, replyTo })
      if (!result.ok) { failed++; continue }

      await db.from('gratitude_letters')
        .update({ sent_to_donor_at: sentAt, sent_to_donor_email: email })
        .eq('id', id)
      sent++
    } catch (e) {
      console.error('[gratitude/send-bulk] failed for', id, e)
      failed++
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, failed, email, sentAt })
}
