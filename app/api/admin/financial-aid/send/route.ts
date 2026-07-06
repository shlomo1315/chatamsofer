import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { getGmailClient } from '@/lib/gmail'
import { buildRawEmail, encodeForGmail } from '@/lib/buildEmail'
import { financialAidInquiryEmail } from '@/lib/emailTemplates'
import { storagePath } from '@/lib/docUrl'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function encodeRaw(to: string, subject: string, html: string, attachments: { filename: string; mimeType: string; contentB64: string }[]): string {
  const from = process.env.GMAIL_EMAIL ?? 'office@chasamsofer.info'
  const raw = buildRawEmail({ from, fromName: 'היכל החתם סופר משרד ראשי', to, subject, html, attachments })
  return encodeForGmail(raw)
}

// שולח לגורם המאשר מייל מעוצב, ושומר את threadId/messageId לצורך שליפת התשובה.
export async function POST(request: NextRequest) {
  if (!(await requirePermission('financial_aid', 'edit'))) return forbidden()
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: req } = await admin
    .from('financial_aid_requests')
    .select('id, reason, document_url, document_name, beneficiary:beneficiaries(family_name, full_name, id_number, spouse_name, marital_status, phone, city, children_count, eligibility_status)')
    .eq('id', id).maybeSingle()
  if (!req) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })

  // ה-beneficiary עשוי לחזור כאובייקט או כמערך — מנרמלים
  const benRaw = (req as Record<string, unknown>).beneficiary
  const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as (Parameters<typeof financialAidInquiryEmail>[0] & { eligibility_status?: string }) | undefined
  if (ben?.eligibility_status !== 'approved') return NextResponse.json({ error: 'המשפחה טרם אושרה במערכת. יש לאשר את המשפחה לפני שליחת הבקשה לאישור.' }, { status: 400 })

  const { data: setting } = await admin.from('app_settings').select('value').eq('key', 'financial_aid_decision_email').maybeSingle()
  const decisionEmail = (setting?.value ?? '').trim()
  if (!decisionEmail) return NextResponse.json({ error: 'לא הוגדר מייל גורם מאשר. הגדר אותו בראש הדף.' }, { status: 400 })

  const mail = financialAidInquiryEmail(ben ?? {}, (req as { reason?: string }).reason)

  // צירוף המסמך שהמבקש העלה בבקשה (אם קיים) — הורדה דרך service-role כדי שתעבוד
  // גם כשהדלי פרטי (לא מסתמכים על URL ציבורי).
  const attachments: { filename: string; mimeType: string; contentB64: string }[] = []
  const docUrl = (req as { document_url?: string }).document_url
  const docName = (req as { document_name?: string }).document_name
  if (docUrl) {
    try {
      const { data: blob } = await admin.storage.from('documents').download(storagePath(docUrl))
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer())
        const ext = (docUrl.split('?')[0].split('.').pop() ?? '').toLowerCase()
        attachments.push({
          filename: docName || `מסמך-מצורף.${ext || 'pdf'}`,
          mimeType: blob.type || 'application/octet-stream',
          contentB64: buf.toString('base64'),
        })
      }
    } catch { /* אם נכשל — שולחים בלי הצרופה */ }
  }

  try {
    const gmail = await getGmailClient()
    let res
    let attachmentSkipped = false
    try {
      res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodeRaw(decisionEmail, mail.subject, mail.html, attachments) },
      })
    } catch (sendErr) {
      // אם השליחה עם הצרופה נכשלה — שולחים שוב בלי הצרופה כדי שהמייל בכל זאת יגיע
      if (attachments.length) {
        console.error('financial-aid send with attachment failed, retrying without:', sendErr)
        attachmentSkipped = true
        res = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: encodeRaw(decisionEmail, mail.subject, mail.html, []) },
        })
      } else {
        throw sendErr
      }
    }
    const threadId = res.data.threadId ?? null
    const messageId = res.data.id ?? null
    await admin.from('financial_aid_requests').update({
      status: 'awaiting_decision',
      decision_email: decisionEmail,
      gmail_thread_id: threadId,
      gmail_message_id: messageId,
      sent_to_decision_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ ok: true, attachmentSkipped })
  } catch (e) {
    console.error('financial-aid send error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בשליחת המייל' }, { status: 500 })
  }
}
