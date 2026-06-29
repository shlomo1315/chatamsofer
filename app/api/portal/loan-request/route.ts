import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { deliverMail, urlToAttachment } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { requestReceivedEmail } from '@/lib/emailTemplates'
import { signedDocUrl } from '@/lib/docUrl'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { notifyRejectedRequest } from '@/lib/rejectedRequestMail'

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

  const { beneficiary_id, amount, installments, purpose, purpose_details, declaration, notes, document_urls } = body

  if (!beneficiary_id || !amount || !installments || !purpose) {
    return NextResponse.json({ error: 'שדות חובה חסרים' }, { status: 400 })
  }

  // אימות סשן הפורטל — הגשת בקשה רק עבור המוטב שאותר בסשן הנוכחי
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== String(beneficiary_id)) {
    return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש לפורטל' }, { status: 401 })
  }

  const parsedAmount = parseFloat(String(amount))
  const parsedInstallments = parseInt(String(installments), 10)

  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }
  if (parsedAmount > 30000) {
    return NextResponse.json({ error: 'הסכום המרבי הוא 30,000 ₪' }, { status: 400 })
  }
  if (isNaN(parsedInstallments) || parsedInstallments <= 0) {
    return NextResponse.json({ error: 'מספר תשלומים לא תקין' }, { status: 400 })
  }
  if (parsedInstallments > 60) {
    return NextResponse.json({ error: 'מספר התשלומים המרבי הוא 60' }, { status: 400 })
  }
  // מטרת "אחר" — חובה לפרט
  if (String(purpose).trim() === 'אחר' && !(purpose_details && String(purpose_details).trim())) {
    return NextResponse.json({ error: 'יש לפרט את מטרת ההלוואה' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, eligibility_status, rejection_reason, email, full_name, family_name, id_number, phone, address, city, marital_status, spouse_name, spouse_id_number, children_count')
    .eq('id', String(beneficiary_id))
    .maybeSingle()

  if (!ben) return NextResponse.json({ error: 'נרשם לא נמצא' }, { status: 404 })
  // בממשק הציבורי גם צאצא בסטטוס "ממתין לאישור" רשאי להגיש — הבקשה עוברת לבדיקת המזכיר.
  // רק צאצא שנדחה אינו רשאי להגיש — ומקבל מייל שהרישום לא אושר.
  if (ben.eligibility_status === 'rejected') {
    notifyRejectedRequest(ben)
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
    document_urls: Array.isArray(document_urls) && document_urls.length ? document_urls : null,
    status: 'pending',
  })

  if (error) {
    return NextResponse.json({ error: 'שגיאה בשמירת הבקשה. אנא נסה שוב.' }, { status: 500 })
  }

  // אישור קבלה לצאצא (לא חוסם את הבקשה אם המייל נכשל) — כולל פרטי המבקש, פרטי ההלוואה והמסמכים
  if (ben.email) {
    const benEmail = ben.email
    const docs = Array.isArray(document_urls)
      ? (document_urls as { url?: string; name?: string }[]).filter(d => d?.url).map(d => ({ name: d.name || 'מסמך מצורף', url: d.url as string }))
      : []
    void (async () => {
      const signedDocs = await Promise.all(docs.map(async d => ({ name: d.name, url: await signedDocUrl(admin, d.url) })))
      const mailData = requestReceivedEmail({
        type: 'loan', firstTime: ben.eligibility_status !== 'approved', beneficiary: ben,
        requestRows: [
          ['מטרת ההלוואה', String(purpose).trim()],
          ['פירוט', purpose_details ? String(purpose_details).trim() : ''],
          ['סכום מבוקש', `₪${parsedAmount.toLocaleString('he-IL')}`],
          ['מספר תשלומים', parsedInstallments],
          ['תשלום חודשי משוער', `₪${Math.round(monthly_payment).toLocaleString('he-IL')}`],
          ['פנייה קודמת לגמ"ח', declaration ? String(declaration) : ''],
          ['הערות', notes ? String(notes).trim() : ''],
        ],
        documents: signedDocs,
      })
      const atts = (await Promise.all(docs.map(d => urlToAttachment(d.url, d.name)))).filter(Boolean) as { filename: string; mimeType: string; contentB64: string }[]
      await deliverMail(benEmail, mailData.subject, mailData.html, atts.length ? atts : undefined, mailFor('igud'))
    })().catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
