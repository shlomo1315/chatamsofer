import { safeError } from '@/lib/safeError'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { getGmailClient } from '@/lib/gmail'
import { buildRawEmail, encodeForGmail } from '@/lib/buildEmail'
import { financialAidManagerEmail } from '@/lib/emailTemplates'
import { managerMailData, findPrevious, type AidRowForMail } from '@/lib/aidDepartmentV2'
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
  const raw = buildRawEmail({ from, fromName: 'מחלקת סיוע · איגוד צאצאי החתם סופר', to, subject, html, attachments })
  return encodeForGmail(raw)
}

// שולח לגורם המאשר מייל מעוצב, ושומר את threadId/messageId לצורך שליפת התשובה.
export async function POST(request: NextRequest) {
  if (!(await requirePermission('financial_aid', 'edit'))) return forbidden()
  const { id, remind, preview } = await request.json()
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // select('*') כדי לעבוד גם לפני שהמיגרציה הוסיפה עמודות
  const { data: req } = await admin
    .from('financial_aid_requests')
    .select('*, beneficiary:beneficiaries(family_name, full_name, id_number, birth_date, address, city, eligibility_status)')
    .eq('id', id).maybeSingle()
  if (!req) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })

  const benRaw = (req as Record<string, unknown>).beneficiary
  const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as (AidRowForMail['beneficiary'] & { eligibility_status?: string }) | undefined
  const row = { ...(req as AidRowForMail), beneficiary: ben ?? null }

  // תזכורת: באותו שרשור, רק לבקשה שכבר ממתינה למנהל
  if (remind) {
    const r = req as { status?: string; gmail_thread_id?: string | null; decision_email?: string | null; decision_reply?: string | null }
    if (r.status !== 'awaiting_decision' || !r.gmail_thread_id || !r.decision_email || r.decision_reply) {
      return NextResponse.json({ error: 'אפשר לשלוח תזכורת רק לבקשה שממתינה לתשובת המנהל' }, { status: 400 })
    }
    const docs = (await admin.from('financial_aid_documents').select('label, file_name').eq('request_id', id)).data ?? []
    const mail = financialAidManagerEmail({ ...managerMailData(row, null, docs.map(d => d.label || d.file_name || 'מסמך')), reminder: true })
    try {
      const gmail = await getGmailClient()
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodeRaw(r.decision_email, `Re: ${mail.subject.replace(/^תזכורת: /, '')}`, mail.html, []), threadId: r.gmail_thread_id } })
      const now = new Date().toISOString()
      await admin.from('financial_aid_requests').update({ reminder_sent_at: now, updated_at: now }).eq('id', id)
      return NextResponse.json({ ok: true })
    } catch (e) {
      console.error('financial-aid reminder error:', safeError(e))
      return NextResponse.json({ error: 'שגיאה בשליחת התזכורת' }, { status: 500 })
    }
  }

  if (ben && ben.eligibility_status !== 'approved') return NextResponse.json({ error: 'המשפחה טרם אושרה במערכת. יש לאשר את המשפחה לפני שליחת הבקשה למנהל.' }, { status: 400 })

  const { data: setting } = await admin.from('app_settings').select('value').eq('key', 'financial_aid_decision_email').maybeSingle()
  const decisionEmail = (setting?.value ?? '').trim()
  if (!decisionEmail) return NextResponse.json({ error: 'לא הוגדר מייל המנהל. הגדירו אותו בראש הדף.' }, { status: 400 })

  // "הגיש בעבר": פנימי, מוצג רק למנהל
  const idNum = String(row.applicant_id_number || ben?.id_number || '').replace(/\D/g, '')
  const ors = [row.beneficiary_id ? `beneficiary_id.eq.${row.beneficiary_id}` : '', idNum ? `applicant_id_number.eq.${idNum}` : '', idNum ? `applicant_id_number.eq.${idNum.replace(/^0+/, '')}` : ''].filter(Boolean)
  const others = ors.length
    ? ((await admin.from('financial_aid_requests').select('*').or(ors.join(',')).lt('created_at', row.created_at)).data ?? []) as AidRowForMail[]
    : []
  const prev = findPrevious(row, [row, ...others])

  const { data: docRows } = await admin.from('financial_aid_documents').select('*').eq('request_id', id).order('created_at')
  const docs = (docRows ?? []) as { kind: string; file_url: string; file_name?: string | null; label?: string | null }[]
  const mail = financialAidManagerEmail(managerMailData(row, prev, docs.map(d => d.file_name || d.label || 'מסמך')))
  // "הצג את המייל שנשלח": אותו מייל, בלי לשלוח
  if (preview) return NextResponse.json({ ok: true, subject: mail.subject, html: mail.html })

  // צירוף המסמך שהמבקש העלה בבקשה (אם קיים) — הורדה דרך service-role כדי שתעבוד
  // גם כשהדלי פרטי (לא מסתמכים על URL ציבורי).
  const attachments: { filename: string; mimeType: string; contentB64: string }[] = []
  const docList: { url: string; name?: string | null }[] = docs.length
    ? docs.map(d => ({ url: d.file_url, name: d.file_name }))
    : ((req as { document_url?: string }).document_url ? [{ url: (req as { document_url: string }).document_url, name: (req as { document_name?: string }).document_name }] : [])
  for (const d of docList) {
    const docUrl = d.url
    const docName = d.name
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
        console.error('financial-aid send with attachment failed, retrying without:', safeError(sendErr))
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
      decision_reply: null,
      decision_replied_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ ok: true, attachmentSkipped })
  } catch (e) {
    console.error('financial-aid send error:', safeError(e))
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בשליחת המייל' }, { status: 500 })
  }
}
