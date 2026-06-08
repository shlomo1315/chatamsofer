import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailClient } from '@/lib/gmail'
import { existingContactEmail, registrationInviteEmail, type ContactBeneficiary } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'

const INTERNAL_DOMAIN = 'chasamsofer.info'
const PORTAL_BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://chatamsofer.vercel.app'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function encodeHeader(text: string): string {
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`
}

async function sendReply(to: string, subject: string, html: string, threadId?: string) {
  const from = process.env.GMAIL_EMAIL ?? 'office@chasamsofer.info'
  const fromName = 'היכל החתם סופר משרד ראשי'
  const bodyB64 = Buffer.from(html, 'utf8').toString('base64')

  const raw = [
    `From: ${encodeHeader(fromName)} <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64,
  ].join('\r\n')

  const encoded = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const gmail = await getGmailClient()
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded, threadId: threadId || undefined },
  })
}

export async function POST(request: NextRequest) {
  const { fromEmail, fromName, threadId } = await request.json()

  if (!fromEmail) return NextResponse.json({ error: 'missing fromEmail' }, { status: 400 })

  // Don't auto-reply to internal domain
  if (fromEmail.endsWith(`@${INTERNAL_DOMAIN}`)) {
    return NextResponse.json({ skipped: true, reason: 'internal' })
  }

  const client = getClient()
  if (!client) return NextResponse.json({ error: 'server error' }, { status: 500 })

  // Look up beneficiary by email (also check spouse_email if it exists)
  const { data: rows } = await client
    .from('beneficiaries')
    .select('id,full_name,family_name,eligibility_status,id_number,phone,city,marital_status,children_count,email,spouse_phone')
    .or(`email.eq.${fromEmail},spouse_phone.eq.${fromEmail}`)
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

  try {
    await sendReply(fromEmail, email.subject, email.html, threadId)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
