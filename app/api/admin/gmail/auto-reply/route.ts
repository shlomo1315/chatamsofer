import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClient } from '@/lib/gmail'
import { existingContactEmail, registrationInviteEmail, type ContactBeneficiary } from '@/lib/emailTemplates'
import { buildRawEmail, encodeForGmail } from '@/lib/buildEmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const INTERNAL_DOMAIN = 'chasamsofer.info'
const PORTAL_BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chasamsofer.co.il'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const { fromEmail, fromName, threadId, messageId: gmailMsgId, subject: origSubject } = await request.json()

  if (!fromEmail) return NextResponse.json({ error: 'missing fromEmail' }, { status: 400 })

  // Don't auto-reply to internal domain or no-reply addresses
  if (
    fromEmail.endsWith(`@${INTERNAL_DOMAIN}`) ||
    fromEmail.startsWith('noreply') ||
    fromEmail.startsWith('no-reply') ||
    fromEmail.startsWith('mailer-daemon')
  ) {
    return NextResponse.json({ skipped: true, reason: 'internal or noreply' })
  }

  const client = getSupabase()
  if (!client) return NextResponse.json({ error: 'server error' }, { status: 500 })

  // מענה אוטומטי נשלח רק על מייל חדש (תחילת שרשור). אם בשרשור כבר קיימת
  // הודעה שיצאה מאיתנו (SENT) — סימן שכבר ענינו, ואין לשלוח מענה אוטומטי נוסף.
  let originalMessageId: string | undefined
  if (threadId) {
    try {
      const gmail = await getGmailClient()
      const thread = await gmail.users.threads.get({
        userId: 'me', id: threadId, format: 'metadata', metadataHeaders: ['Message-ID'],
      })
      const msgs = thread.data.messages ?? []
      const alreadyReplied = msgs.some(m => (m.labelIds ?? []).includes('SENT'))
      if (alreadyReplied) {
        return NextResponse.json({ skipped: true, reason: 'already replied in thread' })
      }
      // מזהה ה-Message-ID של ההודעה הנכנסת — לצורך שרשור תקין של התשובה
      const incoming = msgs.find(m => m.id === gmailMsgId) ?? msgs[0]
      originalMessageId = incoming?.payload?.headers?.find(h => h.name?.toLowerCase() === 'message-id')?.value ?? undefined
    } catch { /* best-effort */ }
  }

  // נפילה אחורה: אם לא הצלחנו לקרוא את השרשור, ננסה לקרוא את ההודעה הבודדת
  if (!originalMessageId) {
    try {
      const gmail = await getGmailClient()
      const orig = await gmail.users.messages.get({ userId: 'me', id: gmailMsgId, format: 'metadata', metadataHeaders: ['Message-ID'] })
      originalMessageId = orig.data.payload?.headers?.find(h => h.name?.toLowerCase() === 'message-id')?.value ?? undefined
    } catch { /* best-effort */ }
  }

  // Look up beneficiary by email
  const { data: rows } = await client
    .from('beneficiaries')
    .select('full_name,family_name,eligibility_status,id_number,phone,city,marital_status,children_count')
    .eq('email', fromEmail)
    .limit(1)

  let email: { subject: string; html: string }

  if (rows && rows.length > 0) {
    const row = rows[0]
    const b: ContactBeneficiary = {
      name: [row.family_name, row.full_name].filter(Boolean).join(' ') || row.full_name,
      eligibility_status: row.eligibility_status,
      id_number: row.id_number,
      phone: row.phone,
      city: row.city,
      marital_status: row.marital_status,
      children_count: row.children_count,
    }
    email = existingContactEmail(b, PORTAL_BASE)
  } else {
    email = registrationInviteEmail(PORTAL_BASE)
  }

  // Use original subject with Re: prefix for natural threading
  const replySubject = origSubject
    ? (origSubject.startsWith('Re:') ? origSubject : `Re: ${origSubject}`)
    : email.subject

  const from = process.env.GMAIL_EMAIL ?? 'office@chasamsofer.info'
  const raw = buildRawEmail({
    from,
    fromName: 'היכל החתם סופר',
    to: fromEmail,
    subject: replySubject,
    html: email.html,
    replyTo: from,
    inReplyTo: originalMessageId,
  })

  try {
    const gmail = await getGmailClient()
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodeForGmail(raw), threadId: threadId || undefined },
    })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
