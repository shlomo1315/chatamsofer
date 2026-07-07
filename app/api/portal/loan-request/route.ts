import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient as getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

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
    .select('id, eligibility_status')
    .eq('id', String(beneficiary_id))
    .maybeSingle()

  if (!ben) return NextResponse.json({ error: 'נרשם לא נמצא' }, { status: 404 })
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

  return NextResponse.json({ ok: true })
}
