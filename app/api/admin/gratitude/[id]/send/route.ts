import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { buildGratitudeVoucher } from '@/lib/gratitudeVoucher'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { loadGratitudeLetter, voucherInputFromRow, donorEmailHtml, DONOR_EMAIL_SUBJECT } from '../shared'

// שליחת מכתב ברכה לנדיב במייל — גוף HTML מכובד מאגף היולדות + השובר המעוצב כצרופת PDF.
// מסמן sent_to_donor_at/email כדי לעקוב אילו כבר נשלחו (שליחה מרוכזת לא תחזור עליהם).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('maternity', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let payload: { email?: string }
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const email = (payload.email ?? '').trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  }

  const row = await loadGratitudeLetter(db, id)
  if (!row) return NextResponse.json({ error: 'מכתב הברכה לא נמצא' }, { status: 404 })
  if (row.status !== 'approved') {
    return NextResponse.json({ error: 'ניתן לשלוח רק מכתב ברכה שאושר' }, { status: 400 })
  }

  // בניית השובר המעוצב
  let voucher
  try {
    voucher = await buildGratitudeVoucher(voucherInputFromRow(row))
  } catch (e) {
    console.error('[gratitude/send] voucher build failed:', e)
    return NextResponse.json({ error: 'שגיאה בהפקת השובר' }, { status: 500 })
  }

  const html = donorEmailHtml(row)
  const { fromEmail, fromName, replyTo } = mailFor('maternity')
  const result = await deliverMail(email, DONOR_EMAIL_SUBJECT, html, [voucher], {
    fromEmail, fromName, replyTo,
  })

  if (!result.ok) {
    console.error('[gratitude/send] deliver failed:', result.error)
    return NextResponse.json({ error: 'שליחת המייל נכשלה' }, { status: 500 })
  }

  const sentAt = new Date().toISOString()
  await db.from('gratitude_letters')
    .update({ sent_to_donor_at: sentAt, sent_to_donor_email: email })
    .eq('id', id)

  return NextResponse.json({ ok: true, email, sentAt })
}
