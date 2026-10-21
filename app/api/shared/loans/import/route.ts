// ייבוא הלוואות שכבר בוצעו: מסמן אותן כבוצעו בלי שטר ובלי שלב המתנה.
import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken, PORTAL_COOKIE } from '@/lib/loansPortalAuth'
import { createClient } from '@supabase/supabase-js'
import { addMonths, format } from 'date-fns'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { parseIdList, planLoanImport, type ImportCandidate } from '@/lib/loansPortalImport'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(PORTAL_COOKIE)?.value
  if (!(await verifyPortalToken(token))) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }

  let body: { ids_text?: string; disbursed_at?: string; disbursed_by?: string } = {}
  try { body = await req.json() } catch { /* ריק */ }

  const ids = parseIdList(body.ids_text ?? '')
  if (!ids.length) return NextResponse.json({ error: 'לא הוזנו מספרי זהות' }, { status: 400 })
  const date = body.disbursed_at
  if (!date || Number.isNaN(new Date(date).getTime())) {
    return NextResponse.json({ error: 'חסר תאריך ביצוע תקין' }, { status: 400 })
  }

  const admin = adminClient()
  const { rows, error } = await fetchAllRows<unknown>((from, to) => admin
    .from('loans')
    .select('id, status, disbursed_at, installments, beneficiary:beneficiaries(id_number)')
    .eq('status', 'approved')
    .is('disbursed_at', null)
    .range(from, to))
  if (error) return NextResponse.json({ error }, { status: 500 })

  const loans = rows as (ImportCandidate & { installments: number | null })[]
  const plan = planLoanImport(ids, loans)
  const byLoan = new Map(loans.map(r => [r.id, r]))
  const start = new Date(date)
  let imported = 0
  for (const loanId of plan.loanIds) {
    const installments = byLoan.get(loanId)?.installments ?? 1
    // ⚠️ אותם eq כמו ב-disburse: לא נוגעים בהלוואה שבינתיים השתנתה.
    const { data, error: upErr } = await admin.from('loans').update({
      status: 'active',
      disbursed_at: date,
      disbursed_by: body.disbursed_by || null,
      start_date: format(start, 'yyyy-MM-dd'),
      end_date: format(addMonths(start, installments || 1), 'yyyy-MM-dd'),
      updated_at: new Date().toISOString(),
    }).eq('id', loanId).eq('status', 'approved').is('disbursed_at', null).select('id')
    if (upErr) return NextResponse.json({ error: upErr.message, imported }, { status: 500 })
    imported += data?.length ?? 0
  }

  return NextResponse.json({ ok: true, imported, notFound: plan.notFound, ambiguous: plan.ambiguous })
}
