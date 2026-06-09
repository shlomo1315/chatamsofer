import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendEmail,
  templateStatusApproved,
  templateStatusRejected,
} from '@/lib/email'
import { docsPendingEmail } from '@/lib/emailTemplates'
import { getGmailClient } from '@/lib/gmail'
import { buildRawEmail, encodeForGmail } from '@/lib/buildEmail'

export const dynamic = 'force-dynamic'

// מיפוי מפתחות המסמכים לתוויות בעברית (תואם לצ'קליסט במסך הניהול)
const DOC_LABELS: Record<string, string> = {
  id_husband:    'תעודת זהות — הבעל',
  id_wife:       'תעודת זהות — האשה',
  marriage_cert: 'תעודת נישואין',
  birth_cert:    'אישור לידה',
  address_proof: 'אישור כתובת מגורים',
  other:         'מסמך נוסף',
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Sends via the Gmail API (configured + working), falling back to SMTP only if Gmail fails.
async function deliver(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const from     = process.env.GMAIL_EMAIL ?? 'office@chasamsofer.info'
    const fromName = 'היכל החתם סופר משרד ראשי'
    const raw      = buildRawEmail({ from, fromName, to, subject, html })
    const gmail    = await getGmailClient()
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodeForGmail(raw) } })
    return { ok: true }
  } catch (gmailErr) {
    console.error('[send-status-email] Gmail failed, trying SMTP:', gmailErr)
    return sendEmail({ to, subject, html })
  }
}

export async function POST(request: NextRequest) {
  const { id, status, reason, docsNotes } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'missing fields' }, { status: 400 })

  const client = getClient()
  const { data: ben, error } = await client
    .from('beneficiaries')
    .select('email, full_name, marital_status, required_docs')
    .eq('id', id)
    .maybeSingle()

  if (error || !ben) return NextResponse.json({ error: 'beneficiary not found' }, { status: 404 })
  if (!ben.email) return NextResponse.json({ ok: true, skipped: 'no email' })

  let payload
  if (status === 'approved') {
    payload = templateStatusApproved(ben.full_name)
  } else if (status === 'rejected') {
    payload = templateStatusRejected(ben.full_name, reason)
  } else if (status === 'docs_pending') {
    // רשימת המסמכים מהצ'קליסט שהמזכירות סימנה (נשמרה ב-required_docs), עם נפילה לפי מצב משפחתי
    const keys = (ben.required_docs ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
    const labels = keys.map((k: string) => DOC_LABELS[k] ?? k)
    payload = docsPendingEmail(ben.full_name, undefined, ben.marital_status, labels, docsNotes)
  } else {
    return NextResponse.json({ ok: true, skipped: 'no template for status' })
  }

  const result = await deliver(ben.email, payload.subject, payload.html)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
