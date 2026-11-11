import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getGmailClient, parseMessage } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

// מחלץ את הטקסט החדש בלבד מתוך תשובת המייל (לפני הציטוט של ההודעה המקורית).
function cleanReplyText(raw: string, max = 200): string {
  let t = (raw || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&gt;|&lt;|&amp;/g, ' ')
  t = t.split(/On .*wrote:|ביום .*כתב|בתאריך .*מאת|-{3,}\s*Original|מאת:|From:|________/i)[0]
  t = t.split('\n').filter(l => !l.trim().startsWith('>')).join(' ')
  return t.replace(/\s+/g, ' ').trim().slice(0, max)
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: reqs } = await admin
    .from('financial_aid_requests')
    .select('id, gmail_thread_id, gmail_message_id, decision_email, decision_reply')
    .eq('status', 'awaiting_decision')
    .not('gmail_thread_id', 'is', null)
  if (!reqs?.length) return NextResponse.json({ ok: true, updated: 0 })

  let gmail
  try { gmail = await getGmailClient() }
  catch { return NextResponse.json({ error: 'Gmail לא מחובר' }, { status: 500 }) }

  // כתובת החשבון שלנו — כדי להבחין בין הודעה שיצאה מאיתנו לבין תשובה נכנסת של הגורם המאשר
  let selfEmail = ''
  try { const prof = await gmail.users.getProfile({ userId: 'me' }); selfEmail = (prof.data.emailAddress ?? '').toLowerCase() } catch { /* לא חוסם */ }

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
      // הודעות נכנסות בשרשור — לא ההודעה ששלחנו, ולא מהחשבון שלנו.
      // הגורם המאשר עשוי להשיב מכתובת שונה מזו שהוגדרה; לכן מעדיפים התאמה לכתובת
      // המוגדרת, ואם אין — לוקחים את ההודעה הנכנסת האחרונה בשרשור (כך לא "מפספסים" תשובה).
      const inbound = msgs.filter(m =>
        m.id !== r.gmail_message_id &&
        !!m.fromEmail &&
        (!selfEmail || m.fromEmail.toLowerCase() !== selfEmail))
      const reply = (decision ? [...inbound].reverse().find(m => m.fromEmail.toLowerCase() === decision) : undefined)
        ?? [...inbound].reverse()[0]
      if (!reply) continue
      const repliedAt0 = reply.date ? new Date(reply.date).toISOString() : new Date().toISOString()
      // שומרים רק את תשובת המנהל. ההחלטה והסכום נשמרים ידנית על ידי המזכירות.
      if ((r as { decision_reply?: string | null }).decision_reply) continue
      await admin.from('financial_aid_requests').update({
        decision_reply: cleanReplyText(reply.body || reply.snippet || '', 1000),
        decision_replied_at: repliedAt0,
        updated_at: new Date().toISOString(),
      }).eq('id', r.id)
      updated++
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
