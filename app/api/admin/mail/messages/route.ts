import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized, allowedMailboxKeys } from '@/lib/apiAuth'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// המרת גוף טקסט-בלבד ל-HTML לתצוגה נאמנה: בריחה מתווי HTML, שמירת שורות ורווחים,
// והפיכת קישורים ללחיצים — כדי שמייל ייראה כמו מייל רגיל ולא כגוש טקסט אחד.
function plainToHtml(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const linked = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
  return linked.replace(/\r\n|\r|\n/g, '<br>')
}

// גוף מוכן-לתצוגה: HTML אמיתי אם קיים, אחרת טקסט שהומר ל-HTML עם שמירת שורות.
function displayBody(html: string | null, plain: string | null): string {
  if (html && html.trim()) return html
  if (plain && plain.trim()) return plainToHtml(plain)
  return ''
}

// טעינת מיילים מ-Supabase (החליף את Gmail). תומך בסינון לפי מחלקה ובחיפוש.
export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const folder = request.nextUrl.searchParams.get('folder') ?? 'INBOX'
  // מנטרלים תווים שמורים של מסנן PostgREST .or() ושל תבנית ilike (% _ * , ( ) \ " ')
  // כדי למנוע "פריצה" של המסנן והרצת תנאים נוספים (filter injection)
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().replace(/[,()*%_\\"']/g, ' ').trim()
  const department = request.nextUrl.searchParams.get('department') ?? ''

  const admin = getAdminClient()
  const nowIso = new Date().toISOString()

  // אכיפת תיבות מורשות: null = ללא הגבלה; [] = ללא גישה; אחרת רשימת מפתחות מותרים.
  // אם המשתמש ביקש תיבה מסוימת והיא מותרת — מסננים אליה; אחרת מסננים לכלל המותרות.
  const allowed = allowedMailboxKeys(staff)
  const reqIsAllowed = !!department && (allowed === null || allowed.includes(department))
  const effectiveKeys: string[] | null = allowed === null
    ? (department ? [department] : null)
    : (reqIsAllowed ? [department] : allowed)
  const effectiveEmails = (effectiveKeys ?? [])
    .map(k => DEPARTMENTS[k as DepartmentKey]?.email)
    .filter((e): e is string => !!e)
  const blocked = allowed !== null && allowed.length === 0  // mail_only ללא תיבות
  if (blocked) return NextResponse.json({ messages: [] })

  // תוויות לכל מייל — נשמרות ב-app_settings (messageId → labelId[])
  const labelsFor = async (): Promise<Record<string, string[]>> => {
    const { data } = await admin.from('app_settings').select('value').eq('key', 'mail_label_assignments').maybeSingle()
    try { return data?.value ? JSON.parse(data.value as string) : {} } catch { return {} }
  }

  // ── דואר יוצא / מתוזמן ──
  if (folder === 'SENT' || folder === 'SCHEDULED') {
    const assignments = await labelsFor()
    let query = admin.from('sent_emails').select('*').limit(50)
    if (folder === 'SCHEDULED') {
      query = query.gt('scheduled_at', nowIso).order('scheduled_at', { ascending: true })
    } else {
      // בדואר יוצא לא מציגים מיילים שעדיין ממתינים לתזמון
      query = query.or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`).order('sent_at', { ascending: false })
    }
    if (effectiveKeys && effectiveKeys.length === 1) query = query.eq('department', effectiveKeys[0])
    else if (effectiveKeys && effectiveKeys.length > 1) query = query.in('department', effectiveKeys)
    if (q) query = query.or(`subject.ilike.%${q}%,to_email.ilike.%${q}%`)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const messages = (data ?? []).map(m => ({
      id: m.id,
      threadId: m.id,
      subject: m.subject ?? '',
      from: `${m.from_name ?? 'היכל החתם סופר'} <${m.reply_to ?? 'noreply@chasamsofer.info'}>`,
      fromEmail: m.reply_to ?? 'noreply@chasamsofer.info',
      to: m.to_email,
      toEmail: m.to_email,
      snippet: (m.html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120),
      date: m.sent_at,
      isRead: true,
      body: m.html ?? '',
      attachments: m.attachments ?? [],
      labelIds: assignments[m.id] ?? [],
      scheduledAt: m.scheduled_at ?? null,
    }))
    return NextResponse.json({ messages })
  }

  // ── דואר נכנס / ספאם ──
  const assignments = await labelsFor()
  let query = admin.from('inbound_emails').select('*').order('received_at', { ascending: false }).limit(50)
  query = folder === 'SPAM' ? query.eq('is_spam', true) : query.eq('is_spam', false)
  if (effectiveEmails.length === 1) query = query.eq('to_email', effectiveEmails[0])
  else if (effectiveEmails.length > 1) query = query.in('to_email', effectiveEmails)
  if (q) query = query.or(`subject.ilike.%${q}%,from_email.ilike.%${q}%,from_name.ilike.%${q}%`)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const messages = (data ?? []).map(m => ({
    id: m.id,
    threadId: m.id,
    subject: m.subject ?? '',
    from: m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email,
    fromEmail: m.from_email,
    to: m.to_email,
    toEmail: m.to_email,
    snippet: (m.plain_text ?? m.html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120),
    date: m.received_at,
    isRead: m.is_read,
    body: displayBody(m.html, m.plain_text),
    bodyText: (m.plain_text ?? '').trim() || null,
    attachments: m.attachments ?? [],
    labelIds: assignments[m.id] ?? [],
    isSpam: !!m.is_spam,
    followUpAt: m.follow_up_at ?? null,
  }))

  // מיילים שסומנו לטיפול וזמנם הגיע — קופצים לראש הרשימה (העדכני-ביותר-לטיפול ראשון)
  if (folder !== 'SPAM') {
    messages.sort((a, b) => {
      const aDue = a.followUpAt && a.followUpAt <= nowIso
      const bDue = b.followUpAt && b.followUpAt <= nowIso
      if (aDue && !bDue) return -1
      if (!aDue && bDue) return 1
      if (aDue && bDue) return (a.followUpAt as string) < (b.followUpAt as string) ? -1 : 1
      return a.date < b.date ? 1 : -1
    })
  }

  return NextResponse.json({ messages })
}
