import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { deliverMail, urlToAttachment } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { requestReceivedEmail } from '@/lib/emailTemplates'
import { signedDocUrl } from '@/lib/docUrl'
import { getPortalBeneficiaryId } from '@/lib/portalSession'

export const dynamic = 'force-dynamic'

const BUCKET = 'documents'
const MAX_SIZE = 10 * 1024 * 1024

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// בקשת סיוע רפואי מהטופס הציבורי: נימוק + מסמך מצורף.
export async function POST(request: NextRequest) {
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let formData: FormData
  try { formData = await request.formData() }
  catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const beneficiaryId = formData.get('beneficiary_id') as string | null
  const reason = (formData.get('reason') as string | null)?.trim() || null
  const file = formData.get('file') as File | null
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'יש לפרט את סיבת הבקשה' }, { status: 400 })

  // אימות סשן הפורטל — הגשת בקשה רק עבור המוטב שאותר בסשן הנוכחי
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId || sessionId !== beneficiaryId) {
    return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש לפורטל' }, { status: 401 })
  }

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, eligibility_status, email, full_name, family_name, id_number, phone, address, city, marital_status, spouse_name, spouse_id_number, children_count')
    .eq('id', beneficiaryId)
    .maybeSingle()
  if (!ben) return NextResponse.json({ error: 'נרשם לא נמצא' }, { status: 404 })
  if (ben.eligibility_status === 'rejected') {
    return NextResponse.json({ error: 'הגשת בקשה אינה זמינה עבור חשבון זה' }, { status: 403 })
  }

  let documentUrl: string | null = null
  let documentName: string | null = null
  if (file && typeof file !== 'string') {
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'הקובץ גדול מ-10MB' }, { status: 400 })
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const path = `${beneficiaryId}/financial-aid/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
    if (upErr) return NextResponse.json({ error: 'שגיאה בהעלאת המסמך' }, { status: 500 })
    documentUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    documentName = file.name
  }

  const { error } = await admin.from('financial_aid_requests').insert({
    beneficiary_id: beneficiaryId,
    reason,
    document_url: documentUrl,
    document_name: documentName,
    status: 'pending',
  })
  if (error) return NextResponse.json({ error: `שגיאה בשמירת הבקשה: ${error.message}` }, { status: 500 })

  if (ben.email) {
    const benEmail = ben.email
    void (async () => {
      const mail = requestReceivedEmail({
        type: 'financial_aid', firstTime: ben.eligibility_status !== 'approved', beneficiary: ben,
        requestRows: [['סיבת הבקשה', reason]],
        documents: documentUrl ? [{ name: documentName || 'מסמך מצורף', url: await signedDocUrl(admin, documentUrl) }] : [],
      })
      const att = documentUrl ? await urlToAttachment(documentUrl, documentName || 'מסמך-מצורף') : null
      await deliverMail(benEmail, mail.subject, mail.html, att ? [att] : undefined, mailFor('medical'))
    })().catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
