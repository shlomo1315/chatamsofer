// ─────────────────────────────────────────────────────────────────────────────
// טיוטת בקשת הלוואה — נשמרת ברגע שהמבקש מוריד את טופס אישור הרב.
//
// הרקע: הטופס דורש חתימה פיזית של רב, וזה לוקח ימים. בלי שמירה המבקש
// היה חוזר לטופס ריק וממלא הכל מחדש. הטיוטה שומרת את כל מה שמילא,
// ובכניסה הבאה נותר לו רק להעלות את הטופס החתום.
//
// POST — יצירת/עדכון הטיוטה (בהורדת הטופס)
// PUT  — העלאת הטופס החתום → הבקשה עוברת ל-pending ומגיעה למזכיר
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { LOAN_DECLARATIONS, LOAN_MAX_AMOUNT } from '@/lib/emailRequestForms'
import {
  findOpenLoan, findDraftAwaitingRabbiForm, openLoanMessageFor, AWAITING_RABBI_FORM,
} from '@/lib/openLoanGuard'
import { isDepartmentAccessible, departmentClosedMessage } from '@/lib/departmentGates'
import { normalizeLoanSource } from '@/lib/loanSubmissionSource'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** POST — שמירת הטיוטה בהורדת טופס אישור הרב. */
export async function POST(request: NextRequest) {
  const previewCode = request.nextUrl.searchParams.get('preview')
  if (!(await isDepartmentAccessible('gemach', previewCode))) {
    return NextResponse.json(
      { error: departmentClosedMessage('gemach'), departmentClosed: true },
      { status: 403 },
    )
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId) {
    return NextResponse.json({ error: 'נדרש אימות מחדש' }, { status: 401 })
  }

  const {
    amount, installments, purpose, purpose_details, declaration, notes, document_urls,
    rabbi_form_url, submission_source,
  } = body

  const parsedAmount = parseFloat(String(amount))
  const parsedInstallments = parseInt(String(installments), 10)

  // ⚠️ אותה ולידציה כמו בהגשה המלאה: טיוטה עם נתונים פגומים הייתה
  // הופכת לבקשה פגומה ברגע שהטופס החתום עולה.
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }
  if (parsedAmount > LOAN_MAX_AMOUNT) {
    return NextResponse.json(
      { error: `הסכום המרבי הוא ${LOAN_MAX_AMOUNT.toLocaleString('en-US')}$` },
      { status: 400 },
    )
  }
  if (isNaN(parsedInstallments) || parsedInstallments <= 0 || parsedInstallments > 60) {
    return NextResponse.json({ error: 'מספר תשלומים לא תקין' }, { status: 400 })
  }
  if (!purpose || !String(purpose).trim()) {
    return NextResponse.json({ error: 'חסרה מטרת ההלוואה' }, { status: 400 })
  }
  const parsedDeclaration = String(declaration ?? '').trim()
  if (!LOAN_DECLARATIONS.includes(parsedDeclaration as typeof LOAN_DECLARATIONS[number])) {
    return NextResponse.json({ error: 'התשובה על פנייה קודמת לגמ"ח אינה תקינה' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // בקשה שכבר הוגשה חוסמת גם יצירת טיוטה חדשה.
  const openLoan = await findOpenLoan(admin, sessionId)
  if (openLoan) {
    return NextResponse.json({ error: openLoanMessageFor(openLoan), openLoan: true }, { status: 409 })
  }

  // 🔴 טופס אישור הרב חובה — הבקשה מוגשת שלמה או לא מוגשת כלל.
  //
  // ⚠️ קודם נשמרה כאן טיוטה בסטטוס awaiting_rabbi_form, והמבקש נדרש
  // לחזור בכניסה נפרדת כדי להעלות את הטופס. רבים לא חזרו: הבקשה נותרה
  // תקועה במצב ביניים והקפיצה חלונית השלמה בכל כניסה. עכשיו הטופס
  // מתקבל בחלונית ההנחיות — לפני המילוי — ומצורף בהגשה עצמה.
  const rabbiFormUrl = String(rabbi_form_url ?? '').trim()
  if (!rabbiFormUrl) {
    return NextResponse.json({ error: 'חובה לצרף את טופס אישור הרב החתום' }, { status: 400 })
  }

  const fields = {
    beneficiary_id: sessionId,
    amount: parsedAmount,
    installments: parsedInstallments,
    monthly_payment: Math.round((parsedAmount / parsedInstallments) * 100) / 100,
    purpose: String(purpose).trim(),
    purpose_details: purpose_details ? String(purpose_details).trim() : null,
    declaration: parsedDeclaration,
    notes: notes ? String(notes).trim() : null,
    document_urls: Array.isArray(document_urls) && document_urls.length ? document_urls : null,
    // ⚠️ pending ולא AWAITING_RABBI_FORM: הבקשה שלמה ומגיעה ישירות
    // לטיפול המזכיר.
    status: 'pending',
    rabbi_form_url: rabbiFormUrl,
    rabbi_form_uploaded_at: new Date().toISOString(),
    // מאיפה הוגשה — לפילוח אתר מול מייל. ראה lib/loanSubmissionSource.
    submission_source: normalizeLoanSource(submission_source),
  }

  // ⚠️ טיוטה קיימת מתעדכנת ולא מוכפלת: הורדה חוזרת של הטופס (כי הקובץ
  // אבד, כי הרב ביקש עותק נוסף) לא אמורה ליצור בקשה שנייה.
  const existing = await findDraftAwaitingRabbiForm(admin, sessionId)

  if (existing) {
    const { error } = await admin.from('loans').update(fields).eq('id', existing.id)
    if (error) {
      return NextResponse.json({ error: 'שגיאה בשמירת הטיוטה' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, loanId: existing.id, updated: true })
  }

  const { data, error } = await admin.from('loans').insert(fields).select('id').maybeSingle()
  if (error) {
    console.error('[loan-draft] insert failed:', error.message)
    return NextResponse.json({ error: 'שגיאה בשמירת הטיוטה' }, { status: 500 })
  }

  const loanId = data?.id ? String(data.id) : null
  if (loanId) void sendRabbiFormMail(admin, loanId, sessionId, parsedAmount, parsedInstallments)

  return NextResponse.json({ ok: true, loanId })
}

/**
 * שולח למבקש את המייל שנושא את טופס אישור הרב.
 *
 * ⚠️ המייל אינו רק נוחות: הוא ההודעה שאליה המבקש *משיב* עם הטופס החתום,
 * וכותרות השרשור של התשובה הן הדרך הנקייה לזהות לאיזו בקשה הוא שייך.
 * בלי המייל הזה אין למבקש שרשור להשיב אליו כלל.
 *
 * ⚠️ לא חוסם את הבקשה: המבקש מוריד את הטופס מהדפדפן ממילא, וכישלון
 * שליחה לא אמור למנוע ממנו להתקדם.
 */
async function sendRabbiFormMail(
  admin: ReturnType<typeof getAdminClient>,
  loanId: string,
  beneficiaryId: string,
  amount: number,
  installments: number,
) {
  if (!admin) return
  try {
    const { data: ben } = await admin
      .from('beneficiaries')
      .select('email, family_name, full_name, id_number, lineage_chain')
      .eq('id', beneficiaryId)
      .maybeSingle()
    if (!ben?.email) return

    const { buildRabbiFormPdf, lineageFromChain } = await import('@/lib/rabbiFormPdf')
    const { rabbiFormEmail } = await import('@/lib/emailTemplates')
    const { loanFormCode } = await import('@/lib/rabbiFormReturn')
    const { deliverMail } = await import('@/lib/sendMail')
    const { mailFor } = await import('@/lib/departments')

    const code = loanFormCode(loanId)
    const mail = rabbiFormEmail({
      familyName: ben.family_name,
      applicantName: ben.full_name,
      amount,
      code,
    })

    const pdf = await buildRabbiFormPdf({
      applicantName: [ben.family_name, ben.full_name].filter(Boolean).join(' '),
      idNumber: String(ben.id_number ?? ''),
      lineage: lineageFromChain(ben.lineage_chain),
    })

    await deliverMail(ben.email, mail.subject, mail.html, [{
      filename: 'טופס-אישור-רב.pdf',
      mimeType: 'application/pdf',
      contentB64: Buffer.from(pdf).toString('base64'),
    }], mailFor('gemach'))
  } catch (e) {
    console.error('[loan-draft] שליחת טופס אישור רב נכשלה:', e)
  }
}

/** PUT — העלאת הטופס החתום. הטיוטה הופכת לבקשה שממתינה לטיפול. */
export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId) {
    return NextResponse.json({ error: 'נדרש אימות מחדש' }, { status: 401 })
  }

  const formUrl = String(body.rabbi_form_url ?? '').trim()
  if (!formUrl) {
    return NextResponse.json({ error: 'חסר הטופס החתום' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const draft = await findDraftAwaitingRabbiForm(admin, sessionId)
  if (!draft) {
    return NextResponse.json({ error: 'לא נמצאה בקשה הממתינה לטופס' }, { status: 404 })
  }

  // ⚠️ ה-eq על הסטטוס אינו מיותר: הוא מונע מהעלאה כפולה (לחיצה
  // כפולה, שתי לשוניות) לדרוס בקשה שכבר עברה לטיפול המזכיר.
  const { error } = await admin
    .from('loans')
    .update({
      rabbi_form_url: formUrl,
      rabbi_form_uploaded_at: new Date().toISOString(),
      status: 'pending',
    })
    .eq('id', draft.id)
    .eq('status', AWAITING_RABBI_FORM)

  if (error) {
    console.error('[loan-draft] submit failed:', error.message)
    return NextResponse.json({ error: 'שגיאה בהגשת הבקשה' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, loanId: draft.id })
}
