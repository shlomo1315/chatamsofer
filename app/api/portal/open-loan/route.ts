// בדיקה אם למוטב יש בקשת הלוואה פתוחה — כדי שהפורטל יציג התראה *לפני*
// מילוי הטופס, ולא ידחה אותו אחרי שכבר השקיע בו זמן.
//
// ⚠️ זו הצגה בלבד. האכיפה האמיתית יושבת ב-POST של loan-request, כי לקוח
// יכול לדלג על המסך הזה לגמרי.
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { findOpenLoan, findDraftAwaitingRabbiForm, openLoanMessageFor } from '@/lib/openLoanGuard'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const beneficiaryId = getPortalBeneficiaryId(request)
  if (!beneficiaryId) return NextResponse.json({ openLoan: false })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ openLoan: false })

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ⚠️ הטיוטה נבדקת *לפני* הבקשה הפתוחה: היא אינה חסימה אלא משימה
  // פתוחה של המבקש עצמו, וזו ההודעה שהוא צריך לראות.
  const draft = await findDraftAwaitingRabbiForm(admin, beneficiaryId)
  if (draft) {
    return NextResponse.json({
      openLoan: false,
      awaitingRabbiForm: true,
      loanId: draft.id,
      amount: draft.amount,
      since: draft.created_at,
    })
  }

  const loan = await findOpenLoan(admin, beneficiaryId)
  if (!loan) return NextResponse.json({ openLoan: false })

  return NextResponse.json({
    openLoan: true,
    message: openLoanMessageFor(loan),
    since: loan.created_at,
  })
}
