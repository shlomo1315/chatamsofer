import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { shell, greetByStatus } from './emailTemplates'
import { getOrCreateReplyToken } from './publicToken'

// ─────────────────────────────────────────────────────────────────────────────
// התכתבות בכל כרטסת של מחלקת סיוע — מקבילה לבירור ההלוואות והיולדות.
//
//   מזכיר כותב בכרטסת → מייל למבקש → ההודעה נרשמת ב-aid_messages
//   המבקש משיב → נקלט בשרשור → הכרטסת מסומנת "התקבלה תשובה"
//
// הכרטסת יכולה להיות בקשת סיוע (financial_aid_requests) או בקשת אלמנה
// קיימת (widow_requests); aid_messages מפריד ביניהן לפי source_table.
// זיהוי התשובה: reply-to ייחודי office+a<token>@ ובנוסף זיהוי לפי שולח.
// ─────────────────────────────────────────────────────────────────────────────

export type AidSource = 'financial_aid_requests' | 'widow_requests'
export const AID_SOURCES: AidSource[] = ['financial_aid_requests', 'widow_requests']
export const isAidSource = (v: string): v is AidSource => (AID_SOURCES as string[]).includes(v)

const INBOUND_DOMAIN = 'chasamsofer.info'
const INQUIRY_SUBJECT = 'בנוגע לבקשתך — מחלקת סיוע, היכל החתם סופר'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

interface Requester {
  email: string
  familyName?: string | null
  name?: string | null
  maritalStatus?: string | null
}

/** כתובת המבקש: מייל שהוזן בטופס, ובהיעדרו מייל הצאצא הרשום. */
export async function loadRequester(db: SupabaseClient, source: AidSource, id: string): Promise<Requester | null> {
  const benSel = 'beneficiary:beneficiaries(family_name, full_name, spouse_name, marital_status, email)'
  type Ben = { family_name?: string | null; full_name?: string | null; spouse_name?: string | null; marital_status?: string | null; email?: string | null }
  const pickBen = (b: unknown): Ben | null => (Array.isArray(b) ? b[0] : b) as Ben | null

  if (source === 'financial_aid_requests') {
    const { data } = await db.from(source)
      .select(`id, applicant_name, applicant_email, ${benSel}`).eq('id', id).maybeSingle()
    if (!data) return null
    const row = data as unknown as { applicant_name?: string | null; applicant_email?: string | null; beneficiary?: unknown }
    const ben = pickBen(row.beneficiary)
    const email = (row.applicant_email || ben?.email || '').trim()
    return { email, familyName: ben?.family_name, name: row.applicant_name || ben?.spouse_name || ben?.full_name, maritalStatus: ben?.marital_status }
  }
  const { data } = await db.from(source).select(`id, ${benSel}`).eq('id', id).maybeSingle()
  if (!data) return null
  const ben = pickBen((data as unknown as { beneficiary?: unknown }).beneficiary)
  return { email: (ben?.email ?? '').trim(), familyName: ben?.family_name, name: ben?.spouse_name || ben?.full_name, maritalStatus: ben?.marital_status }
}

interface PriorMessage { message_id?: string | null; references_chain?: string | null }

async function loadPrior(db: SupabaseClient, source: AidSource, id: string): Promise<PriorMessage[]> {
  const { data } = await db.from('aid_messages')
    .select('message_id, references_chain, created_at')
    .eq('source_table', source).eq('request_id', id)
    .order('created_at', { ascending: true })
  return (data ?? []) as PriorMessage[]
}

/** שולח הודעה למבקש ורושם אותה בכרטסת. בקשה חדשה עוברת ל"בבירור". */
export async function sendAidInquiry(
  db: SupabaseClient,
  source: AidSource,
  id: string,
  body: string,
  sender: { id: string; name: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = body.trim()
  if (!text) return { ok: false, error: 'ההודעה ריקה' }

  const req = await loadRequester(db, source, id)
  if (!req) return { ok: false, error: 'הכרטסת לא נמצאה' }
  if (!req.email) return { ok: false, error: 'למבקש אין כתובת מייל' }

  const token = await getOrCreateReplyToken(db, 'a', id, source)
  if (!token) return { ok: false, error: 'הנפקת מזהה המענה נכשלה' }

  const prior = await loadPrior(db, source, id)
  const anchor = `<aid-${id}@${INBOUND_DOMAIN}>`
  const thread: { inReplyTo?: string; references?: string } = {}
  let subject: string
  let html: string

  if (prior.length === 0) {
    subject = INQUIRY_SUBJECT
    thread.references = anchor
    thread.inReplyTo = anchor
    html = shell({
      preheader: 'הודעה מהמזכירות בנוגע לבקשתך',
      accent: '#1B3256',
      title: 'בנוגע לבקשתך',
      subtitle: 'מחלקת סיוע · היכל החתם סופר',
      body: `
        <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;">${greetByStatus(req.familyName, req.name, req.maritalStatus)}</p>
        <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">בנוגע לבקשה שהגשת, להלן ההודעה מהמזכירות:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          <tr><td style="background:#f1f5f9;border-right:4px solid #1B3256;border-radius:0 12px 12px 0;padding:16px 20px;color:#0f172a;font-size:15px;line-height:1.8;">
            ${esc(text).replace(/\n/g, '<br/>')}
          </td></tr>
        </table>
        <p style="margin:0;color:#78350f;font-size:14px;line-height:1.7;"><strong>חשוב:</strong> להשיב <strong>בתשובה למייל הזה</strong> (כפתור "השב"), כדי שהתשובה תשויך לבקשה שלך.</p>`,
    })
  } else {
    subject = `Re: ${INQUIRY_SUBJECT}`
    const last = [...prior].reverse().find(m => m.message_id)
    if (last?.message_id) {
      thread.inReplyTo = last.message_id
      thread.references = [last.references_chain, last.message_id].filter(Boolean).join(' ').trim()
    } else {
      // ללא Message-ID של המבקש (Google dual-delivery אוכל כותרות): עוגן קבוע לתיק.
      thread.references = anchor
      thread.inReplyTo = anchor
    }
    html = `<div dir="rtl" style="font-family:'Heebo',Arial,sans-serif;font-size:15px;line-height:1.9;color:#0f172a;white-space:pre-wrap;">${esc(text).replace(/\n/g, '<br/>')}</div>`
  }

  const sent = await deliverMail(req.email, subject, html, undefined, {
    ...mailFor('aid'),
    replyTo: `office+a${token}@${INBOUND_DOMAIN}`,
    gmailPriority: 'never',
    ...thread,
  })
  if (!sent.ok) return { ok: false, error: 'שליחת המייל נכשלה' }

  await db.from('aid_messages').insert({
    source_table: source, request_id: id, direction: 'staff', body: text,
    sender_id: sender.id, sender_name: sender.name, is_read: true,
  })

  // בקשה חדשה שנשלחה לה הודעה עוברת ל"בבירור" (רק מסטטוס ממתין)
  if (source === 'financial_aid_requests') {
    await db.from(source).update({ status: 'inquiry', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending')
  }
  return { ok: true }
}


/** קליטת תשובת המבקש. מחזיר false כשלא נקלטה. התשובה מחזירה את הבקשה ל"ממתין". */
export async function handleAidInquiryReply(
  db: SupabaseClient,
  source: AidSource,
  id: string,
  body: string,
  meta?: { messageId?: string | null; references?: string | null; senderName?: string | null; attachmentUrl?: string | null; attachmentName?: string | null },
): Promise<boolean> {
  const text = (body ?? '').trim()
  if (!text) return false
  const { error } = await db.from('aid_messages').insert({
    source_table: source, request_id: id, direction: 'applicant', body: text,
    sender_name: meta?.senderName ?? null,
    message_id: meta?.messageId ?? null,
    references_chain: meta?.references ?? null,
    attachment_url: meta?.attachmentUrl ?? null,
    attachment_name: meta?.attachmentName ?? null,
    is_read: false,
  })
  if (error) return false
  if (source === 'financial_aid_requests') {
    await db.from(source).update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'inquiry')
  }
  return true
}

/** גיבוי כשהטוקן נאכל: בקשה פתוחה לפי מייל השולח. */
export async function findAidRequestBySender(db: SupabaseClient, senderEmail: string): Promise<{ source: AidSource; id: string } | null> {
  const e = senderEmail.trim().toLowerCase()
  if (!e) return null
  const { data } = await db.from('financial_aid_requests')
    .select('id').ilike('applicant_email', e).eq('status', 'inquiry')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  return data ? { source: 'financial_aid_requests', id: String(data.id) } : null
}
