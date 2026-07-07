import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { requestReceivedEmail } from '@/lib/emailTemplates'
import { notifyRejectedRequest } from '@/lib/rejectedRequestMail'
import { rateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

const MAX_WIDOW_AMOUNT = 100000 // תקרה שפויה לבקשת סיוע — בולמת ערכים אבסורדיים

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { beneficiary_id, request_type, description, amount } = body

  if (!beneficiary_id || !request_type) {
    return NextResponse.json({ error: 'שדות חסרים' }, { status: 400 })
  }

  // אימות סשן הפורטל — הגשת בקשה רק עבור המוטב שאותר בסשן הנוכחי
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== String(beneficiary_id)) {
    return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש לפורטל' }, { status: 401 })
  }

  // הגבלת קצב per-מוטב — בולמת הצפה של בקשות (spam / double-submit)
  if (!rateLimit(`widow-request:${sessionId}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'הגשת יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 })
  }

  const validTypes = ['financial', 'food', 'general']
  if (!validTypes.includes(String(request_type))) {
    return NextResponse.json({ error: 'סוג בקשה לא תקין' }, { status: 400 })
  }

  // ולידציית סכום — דוחה NaN/שלילי/אבסורדי (עקבי עם loan-request)
  let amountValue: number | null = null
  if (amount != null && amount !== '') {
    const n = Number(amount)
    if (!Number.isFinite(n) || n < 0 || n > MAX_WIDOW_AMOUNT) {
      return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
    }
    amountValue = n
  }

  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // Verify the beneficiary is a widow/widower
  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, full_name, family_name, email, id_number, phone, marital_status, eligibility_status, rejection_reason')
    .eq('id', String(beneficiary_id))
    .maybeSingle()

  if (!ben) return NextResponse.json({ error: 'צאצא לא נמצא' }, { status: 404 })
  if (!['אלמן', 'אלמנה'].includes(ben.marital_status ?? '')) {
    return NextResponse.json({ error: 'לא רשאי להגיש בקשה זו' }, { status: 403 })
  }
  if (ben.eligibility_status === 'rejected') {
    notifyRejectedRequest(ben)
    return NextResponse.json({ error: 'הגשת בקשה אינה זמינה עבור חשבון זה' }, { status: 403 })
  }
  if (ben.eligibility_status !== 'approved') {
    return NextResponse.json({ error: 'הפרופיל אינו מאושר עדיין' }, { status: 403 })
  }

  const { error } = await admin.from('widow_requests').insert({
    beneficiary_id: String(beneficiary_id),
    request_type: String(request_type),
    description: description ? String(description).trim() : null,
    amount: amountValue,
    status: 'pending',
  })

  if (error) {
    console.error('[widow-request]', error.message)
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  }

  // אישור קבלה מהאיגוד (לא חוסם את הבקשה אם המייל נכשל)
  if (ben.email) {
    const benEmail = ben.email
    const typeLabel = request_type === 'food' ? 'סיוע במזון' : request_type === 'general' ? 'בקשה כללית' : 'סיוע כספי'
    void (async () => {
      const mail = requestReceivedEmail({
        type: 'widow',
        firstTime: false,
        beneficiary: ben,
        requestRows: [
          ['סוג הבקשה', typeLabel],
          ['פירוט', description ? String(description).trim() : ''],
          ['סכום מבוקש', amount ? `₪${Number(amount).toLocaleString('he-IL')}` : ''],
        ],
      })
      await deliverMail(benEmail, mail.subject, mail.html, undefined, mailFor('igud'))
    })().catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
