import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getGmailClient, parseMessage } from '@/lib/gmail'
import { deliverMail } from '@/lib/sendMail'
import { financialAidDecisionEmail } from '@/lib/emailTemplates'

export const dynamic = 'force-dynamic'

// מחלץ את הטקסט החדש בלבד מתוך תשובת המייל (לפני הציטוט של ההודעה המקורית).
function cleanReplyText(raw: string): string {
  let t = (raw || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&gt;|&lt;|&amp;/g, ' ')
  t = t.split(/On .*wrote:|ביום .*כתב|בתאריך .*מאת|-{3,}\s*Original|מאת:|From:|________/i)[0]
  t = t.split('\n').filter(l => !l.trim().startsWith('>')).join(' ')
  return t.replace(/\s+/g, ' ').trim().slice(0, 200)
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function verifyStaff() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// מפענח את תוכן התשובה (הטקסט החדש בלבד, לפני הציטוט):
// מספר → מאושר + סכום · X → נדחה · אחרת → ללא הכרעה.
function parseDecision(raw: string): { kind: 'approved'; amount: number } | { kind: 'rejected' } | { kind: 'none' } {
  let t = (raw || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  // חיתוך הציטוט של ההודעה המקורית (שמכיל ת.ז/טלפון — לא לפענח משם)
  t = t.split(/On .*wrote:|ביום .*כתב|-{3,}\s*Original|מאת:|From:|________/i)[0]
  t = t.split('\n').filter(l => !l.trim().startsWith('>')).join(' ')
  const head = t.slice(0, 300)
  const numMatch = head.replace(/[,₪]/g, '').match(/\d{1,7}/)
  if (numMatch) {
    const amount = parseInt(numMatch[0], 10)
    if (amount > 0) return { kind: 'approved', amount }
  }
  if (/(^|\s)x(\s|$|\.)/i.test(head) || /לא\s*מאושר|נדח|לא לאשר|דחה/i.test(head)) return { kind: 'rejected' }
  return { kind: 'none' }
}

export async function POST() {
  if (!(await verifyStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: reqs } = await admin
    .from('financial_aid_requests')
    .select('id, gmail_thread_id, gmail_message_id, decision_email, beneficiary:beneficiaries(full_name, family_name, email)')
    .eq('status', 'awaiting_decision')
    .not('gmail_thread_id', 'is', null)
  if (!reqs?.length) return NextResponse.json({ ok: true, updated: 0 })

  let gmail
  try { gmail = await getGmailClient() }
  catch { return NextResponse.json({ error: 'Gmail לא מחובר' }, { status: 500 }) }

  let updated = 0
  for (const r of reqs) {
    try {
      const thread = await gmail.users.threads.get({ userId: 'me', id: r.gmail_thread_id as string, format: 'full' })
      const msgs = (thread.data.messages ?? []).map(parseMessage)
      const decision = (r.decision_email ?? '').toLowerCase()
      // ההודעה האחרונה מהגורם המאשר שאינה ההודעה ששלחנו
      const reply = [...msgs].reverse().find(m =>
        m.id !== r.gmail_message_id &&
        (!decision || m.fromEmail.toLowerCase() === decision))
      if (!reply) continue
      const cleaned = cleanReplyText(reply.body || reply.snippet)
      const d = parseDecision(cleaned || reply.snippet)
      if (d.kind === 'none') continue
      const repliedAt = reply.date ? new Date(reply.date).toISOString() : new Date().toISOString()
      await admin.from('financial_aid_requests').update({
        status: d.kind === 'approved' ? 'approved' : 'rejected',
        amount: d.kind === 'approved' ? d.amount : null,
        decision_reply: cleaned.slice(0, 200),
        decision_replied_at: repliedAt,
        updated_at: new Date().toISOString(),
      }).eq('id', r.id)
      updated++

      // הודעת החלטה למבקש
      const ben = (r as Record<string, unknown>).beneficiary as { full_name?: string; family_name?: string; email?: string } | undefined
      if (ben?.email) {
        const name = [ben.family_name, ben.full_name].filter(Boolean).join(' ') || ben.full_name || ''
        const mail = financialAidDecisionEmail(name, d.kind === 'approved', d.kind === 'approved' ? d.amount : null)
        deliverMail(ben.email, mail.subject, mail.html).catch(() => {})
      }
    } catch { /* ממשיכים לבקשה הבאה */ }
  }
  return NextResponse.json({ ok: true, updated })
}
