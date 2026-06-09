import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { deliverMail } from '@/lib/sendMail'
import { requestReceivedEmail } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const { beneficiary_id, amount, installments, purpose, purpose_details, declaration, notes } = body

  if (!beneficiary_id || !amount || !installments || !purpose) {
    return NextResponse.json({ error: 'שדות חובה חסרים' }, { status: 400 })
  }

  const parsedAmount = parseFloat(String(amount))
  const parsedInstallments = parseInt(String(installments), 10)

  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }
  if (isNaN(parsedInstallments) || parsedInstallments <= 0) {
    return NextResponse.json({ error: 'מספר תשלומים לא תקין' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, eligibility_status, email, full_name')
    .eq('id', String(beneficiary_id))
    .maybeSingle()

  if (!ben) return NextResponse.json({ error: 'נרשם לא נמצא' }, { status: 404 })
  // בממשק הציבורי גם נתמך בסטטוס "ממתין לאישור" רשאי להגיש — הבקשה עוברת לבדיקת המזכיר.
  // רק נתמך שנדחה אינו רשאי להגיש.
  if (ben.eligibility_status === 'rejected') {
    return NextResponse.json({ error: 'הגשת בקשה אינה זמינה עבור חשבון זה' }, { status: 403 })
  }

  const monthly_payment = parsedAmount / parsedInstallments

  const { error } = await admin.from('loans').insert({
    beneficiary_id: String(beneficiary_id),
    amount: parsedAmount,
    installments: parsedInstallments,
    monthly_payment: Math.round(monthly_payment * 100) / 100,
    purpose: String(purpose).trim(),
    purpose_details: purpose_details ? String(purpose_details).trim() : null,
    declaration: declaration ? String(declaration) : null,
    notes: notes ? String(notes).trim() : null,
    status: 'pending',
  })

  if (error) {
    return NextResponse.json({ error: 'שגיאה בשמירת הבקשה. אנא נסה שוב.' }, { status: 500 })
  }

  // אישור קבלה לנתמך (לא חוסם את הבקשה אם המייל נכשל)
  if (ben.email) {
    const firstTime = ben.eligibility_status !== 'approved'
    const mail = requestReceivedEmail(ben.full_name || '', 'loan', firstTime)
    deliverMail(ben.email, mail.subject, mail.html).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
