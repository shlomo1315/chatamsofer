import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
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
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
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

  // תיוג כל התכתובת של "הגורם המאשר" כדי שלא תציף את הדואר הראשי
  const DECISION_LABEL = 'label-decision'
  const threadMsgIds = new Set<string>()

  let updated = 0
  for (const r of reqs) {
    try {
      const thread = await gmail.users.threads.get({ userId: 'me', id: r.gmail_thread_id as string, format: 'full' })
      const msgs = (thread.data.messages ?? []).map(parseMessage)
      for (const m of msgs) if (m.id) threadMsgIds.add(m.id)  // לתיוג בתווית "הגורם המאשר"
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

  // תיוג ההודעות בתווית "הגורם המאשר" + ודא שהתווית קיימת
  if (threadMsgIds.size) {
    try {
      const { data: defRow } = await admin.from('app_settings').select('value').eq('key', 'mail_label_defs').maybeSingle()
      let defs: { id: string; name: string; color: string }[] = []
      if (defRow?.value) { try { defs = JSON.parse(defRow.value) } catch { /* */ } }
      if (defs.length && !defs.some(d => d.id === DECISION_LABEL)) {
        defs.push({ id: DECISION_LABEL, name: 'הגורם המאשר', color: '#0ea5e9' })
        await admin.from('app_settings').upsert({ key: 'mail_label_defs', value: JSON.stringify(defs), updated_at: new Date().toISOString() }, { onConflict: 'key' })
      }
      const { data: asgRow } = await admin.from('app_settings').select('value').eq('key', 'mail_label_assignments').maybeSingle()
      let asg: Record<string, string[]> = {}
      if (asgRow?.value) { try { asg = JSON.parse(asgRow.value) } catch { /* */ } }
      let changed = false
      for (const mid of threadMsgIds) {
        const cur = asg[mid] ?? []
        if (!cur.includes(DECISION_LABEL)) { asg[mid] = [...cur, DECISION_LABEL]; changed = true }
      }
      if (changed) await admin.from('app_settings').upsert({ key: 'mail_label_assignments', value: JSON.stringify(asg), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    } catch { /* תיוג כושל לא יפיל את הבדיקה */ }
  }

  return NextResponse.json({ ok: true, updated })
}
