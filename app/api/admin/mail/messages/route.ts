import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireMailAccess, unauthorized, allowedMailboxKeys } from '@/lib/apiAuth'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

export const dynamic = 'force-dynamic'

// ג ן¸ ׳ ׳™׳˜׳¨׳•׳ ׳×׳•׳•׳™׳ ׳©׳׳•׳¨׳™׳ ׳©׳ ׳׳¡׳ ׳ .or() ׳•׳©׳ ׳×׳‘׳ ׳™׳× ilike. ׳‘׳׳¢׳“׳™׳• ׳₪׳¡׳™׳§ ׳׳• ׳¡׳•׳’׳¨
// ׳‘׳§׳׳˜ ׳”׳—׳™׳₪׳•׳© ׳׳•׳¡׳™׳₪׳™׳ ׳×׳ ׳׳™ ׳׳¡׳ ׳ ׳׳©׳׳”׳ (filter injection). ׳¡׳™׳ ׳•׳ ׳”׳׳—׳׳§׳” ׳ ׳׳›׳£
// ׳›׳×׳ ׳׳™ AND ׳ ׳₪׳¨׳“ ׳•׳׳™׳ ׳• ׳ ׳™׳×׳ ׳׳¢׳§׳™׳₪׳” ׳׳›׳׳, ׳•׳׳›׳ ׳”׳—׳©׳™׳₪׳” ׳׳•׳’׳‘׳׳× ג€” ׳׳‘׳ ׳׳™׳ ׳¡׳™׳‘׳”
// ׳׳׳₪׳©׳¨ ׳׳× ׳–׳” ׳‘׳›׳׳. ׳׳•׳×׳• ׳ ׳™׳˜׳¨׳•׳ ׳›׳׳• ׳‘-beneficiary-search.
const safeLike = (q: string) => q.replace(/[,()*%_\\"']/g, ' ').trim()

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ׳”׳׳¨׳× ׳’׳•׳£ ׳˜׳§׳¡׳˜-׳‘׳׳‘׳“ ׳-HTML ׳׳×׳¦׳•׳’׳” ׳ ׳׳׳ ׳”: ׳‘׳¨׳™׳—׳” ׳׳×׳•׳•׳™ HTML, ׳©׳׳™׳¨׳× ׳©׳•׳¨׳•׳× ׳•׳¨׳•׳•׳—׳™׳,
// ׳•׳”׳₪׳™׳›׳× ׳§׳™׳©׳•׳¨׳™׳ ׳׳׳—׳™׳¦׳™׳ ג€” ׳›׳“׳™ ׳©׳׳™׳™׳ ׳™׳™׳¨׳׳” ׳›׳׳• ׳׳™׳™׳ ׳¨׳’׳™׳ ׳•׳׳ ׳›׳’׳•׳© ׳˜׳§׳¡׳˜ ׳׳—׳“.
function plainToHtml(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const linked = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
  return linked.replace(/\r\n|\r|\n/g, '<br>')
}

// ׳’׳•׳£ ׳׳•׳›׳-׳׳×׳¦׳•׳’׳”: HTML ׳׳׳™׳×׳™ ׳׳ ׳§׳™׳™׳, ׳׳—׳¨׳× ׳˜׳§׳¡׳˜ ׳©׳”׳•׳׳¨ ׳-HTML ׳¢׳ ׳©׳׳™׳¨׳× ׳©׳•׳¨׳•׳×.
function displayBody(html: string | null, plain: string | null): string {
  if (html && html.trim()) return html
  if (plain && plain.trim()) return plainToHtml(plain)
  return ''
}

// ׳˜׳¢׳™׳ ׳× ׳׳™׳™׳׳™׳ ׳-Supabase (׳”׳—׳׳™׳£ ׳׳× Gmail). ׳×׳•׳׳ ׳‘׳¡׳™׳ ׳•׳ ׳׳₪׳™ ׳׳—׳׳§׳” ׳•׳‘׳—׳™׳₪׳•׳©.
export async function GET(request: NextRequest) {
  const staff = await requireMailAccess()
  if (!staff) return unauthorized()

  const folder = request.nextUrl.searchParams.get('folder') ?? 'INBOX'
  // ׳׳ ׳˜׳¨׳׳™׳ ׳×׳•׳•׳™׳ ׳©׳׳•׳¨׳™׳ ׳©׳ ׳׳¡׳ ׳ PostgREST .or() ׳•׳©׳ ׳×׳‘׳ ׳™׳× ilike (% _ * , ( ) \ " ')
  // ׳›׳“׳™ ׳׳׳ ׳•׳¢ "׳₪׳¨׳™׳¦׳”" ׳©׳ ׳”׳׳¡׳ ׳ ׳•׳”׳¨׳¦׳× ׳×׳ ׳׳™׳ ׳ ׳•׳¡׳₪׳™׳ (filter injection)
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().replace(/[,()*%_\\"']/g, ' ').trim()
  const department = request.nextUrl.searchParams.get('department') ?? ''

  // ׳“׳₪׳“׳•׳£: 50 ׳׳¢׳׳•׳“. ׳׳•׳©׳›׳™׳ PAGE_SIZE+1 ׳›׳“׳™ ׳׳“׳¢׳× ׳׳ ׳§׳™׳™׳ ׳¢׳׳•׳“ ׳”׳‘׳ ׳‘׳׳™ ׳¡׳₪׳™׳¨׳” ׳ ׳₪׳¨׳“׳×.
  const PAGE_SIZE = 50
  const page = Math.max(0, parseInt(request.nextUrl.searchParams.get('page') ?? '0', 10) || 0)
  const rangeFrom = page * PAGE_SIZE
  const rangeTo = rangeFrom + PAGE_SIZE // ׳›׳•׳׳ ג€” ׳©׳•׳¨׳” ׳¢׳•׳“׳₪׳× ׳׳—׳× ׳׳–׳™׳”׳•׳™ hasMore

  const admin = getAdminClient()
  const nowIso = new Date().toISOString()

  // ׳׳›׳™׳₪׳× ׳×׳™׳‘׳•׳× ׳׳•׳¨׳©׳•׳×: null = ׳׳׳ ׳”׳’׳‘׳׳”; [] = ׳׳׳ ׳’׳™׳©׳”; ׳׳—׳¨׳× ׳¨׳©׳™׳׳× ׳׳₪׳×׳—׳•׳× ׳׳•׳×׳¨׳™׳.
  // ׳׳ ׳”׳׳©׳×׳׳© ׳‘׳™׳§׳© ׳×׳™׳‘׳” ׳׳¡׳•׳™׳׳× ׳•׳”׳™׳ ׳׳•׳×׳¨׳× ג€” ׳׳¡׳ ׳ ׳™׳ ׳׳׳™׳”; ׳׳—׳¨׳× ׳׳¡׳ ׳ ׳™׳ ׳׳›׳׳ ׳”׳׳•׳×׳¨׳•׳×.
  const allowed = allowedMailboxKeys(staff)
  const reqIsAllowed = !!department && (allowed === null || allowed.includes(department))
  const effectiveKeys: string[] | null = allowed === null
    ? (department ? [department] : null)
    : (reqIsAllowed ? [department] : allowed)
  const effectiveEmails = (effectiveKeys ?? [])
    .map(k => DEPARTMENTS[k as DepartmentKey]?.email)
    .filter((e): e is string => !!e)
  const blocked = allowed !== null && allowed.length === 0  // mail_only ׳׳׳ ׳×׳™׳‘׳•׳×
  if (blocked) return NextResponse.json({ messages: [] })

  // ׳×׳•׳•׳™׳•׳× ׳׳›׳ ׳׳™׳™׳ ג€” ׳ ׳©׳׳¨׳•׳× ׳‘-app_settings (messageId ג†’ labelId[])
  const labelsFor = async (): Promise<Record<string, string[]>> => {
    const { data } = await admin.from('app_settings').select('value').eq('key', 'mail_label_assignments').maybeSingle()
    try { return data?.value ? JSON.parse(data.value as string) : {} } catch { return {} }
  }

  // ג”€ג”€ ׳“׳•׳׳¨ ׳™׳•׳¦׳ / ׳׳×׳•׳–׳׳ ג”€ג”€
  if (folder === 'SENT' || folder === 'SCHEDULED') {
    const assignments = await labelsFor()
    let query = admin.from('sent_emails').select('*').range(rangeFrom, rangeTo)
    if (folder === 'SCHEDULED') {
      query = query.gt('scheduled_at', nowIso).order('scheduled_at', { ascending: true })
    } else {
      // ׳‘׳“׳•׳׳¨ ׳™׳•׳¦׳ ׳׳ ׳׳¦׳™׳’׳™׳ ׳׳™׳™׳׳™׳ ׳©׳¢׳“׳™׳™׳ ׳׳׳×׳™׳ ׳™׳ ׳׳×׳–׳׳•׳
      query = query.or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`).order('sent_at', { ascending: false })
    }
    if (effectiveKeys && effectiveKeys.length === 1) query = query.eq('department', effectiveKeys[0])
    else if (effectiveKeys && effectiveKeys.length > 1) query = query.in('department', effectiveKeys)
    if (q) { const s = safeLike(q); query = query.or(`subject.ilike.%${s}%,to_email.ilike.%${s}%`) }
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // ׳”׳©׳•׳¨׳” ׳”-51 (׳׳ ׳§׳™׳™׳׳×) ׳׳¦׳™׳™׳ ׳× ׳©׳™׳© ׳¢׳׳•׳“ ׳”׳‘׳ ג€” ׳—׳•׳×׳›׳™׳ ׳׳•׳×׳” ׳•׳׳—׳–׳™׳¨׳™׳ hasMore.
    const rows = data ?? []
    const hasMore = rows.length > PAGE_SIZE
    const messages = rows.slice(0, PAGE_SIZE).map(m => ({
      id: m.id,
      threadId: m.id,
      subject: m.subject ?? '',
      from: `${m.from_name ?? '׳”׳™׳›׳ ׳”׳—׳×׳ ׳¡׳•׳₪׳¨'} <${m.reply_to ?? 'noreply@chasamsofer.info'}>`,
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
    return NextResponse.json({ messages, page, pageSize: PAGE_SIZE, hasMore })
  }

  // ג”€ג”€ ׳“׳•׳׳¨ ׳ ׳›׳ ׳¡ / ׳¡׳₪׳׳ / ׳׳¨׳›׳™׳•׳ (LEGACY) ג”€ג”€
  const assignments = await labelsFor()
  const isLegacy = folder === 'LEGACY'
  let query = admin.from('inbound_emails').select('*').order('received_at', { ascending: false }).range(rangeFrom, rangeTo)
  if (isLegacy) {
    query = query.eq('source', 'legacy')
    // ׳×׳©׳•׳‘׳•׳× ׳¦'׳׳˜ (׳‘׳™׳¨׳•׳¨׳™ ׳”׳׳•׳•׳׳”) ׳׳™׳ ׳ ׳—׳׳§ ׳׳”׳׳¨׳›׳™׳•׳ ג€” ׳׳•׳¦׳׳•׳× ׳’׳ ׳›׳׳, ׳›׳׳• ׳‘׳“׳•׳׳¨ ׳”׳¨׳’׳™׳.
    query = query.eq('is_chat', false)
    const sub = request.nextUrl.searchParams.get('sub')
    if (sub === 'assigned') query = query.not('beneficiary_id', 'is', null)
    else if (sub === 'unassigned') query = query.is('beneficiary_id', null)
    // ׳׳¨׳›׳™׳•׳ ׳׳¡׳•׳ ׳ ׳׳₪׳™ ׳”׳׳—׳׳§׳•׳× ׳”׳׳•׳¨׳©׳•׳× (effectiveKeys), ׳‘׳“׳™׳•׳§ ׳›׳׳• ׳”׳“׳•׳׳¨ ׳”׳™׳•׳¦׳ ג€”
    // ׳•׳׳ ׳׳₪׳™ ׳₪׳¨׳׳˜׳¨ department ׳’׳•׳׳׳™ ׳׳”׳׳§׳•׳— (׳©׳׳™׳₪׳©׳¨ ׳§׳¨׳™׳׳× ׳׳¨׳›׳™׳•׳ ׳©׳ ׳׳—׳׳§׳” ׳–׳¨׳”).
    if (effectiveKeys && effectiveKeys.length === 1) query = query.eq('department', effectiveKeys[0])
    else if (effectiveKeys && effectiveKeys.length > 1) query = query.in('department', effectiveKeys)
  } else {
    query = folder === 'SPAM' ? query.eq('is_spam', true) : query.eq('is_spam', false)
    // ׳×׳•׳™׳× "׳¦'׳׳˜" ג€” ׳×׳©׳•׳‘׳•׳× ׳׳‘׳™׳¨׳•׳¨׳™ ׳”׳׳•׳•׳׳”. ׳”׳ ׳׳•׳¦׳’׳•׳× ׳‘׳©׳¨׳©׳•׳¨ ׳©׳‘׳×׳™׳§ ׳”׳”׳׳•׳•׳׳”,
    // ׳•׳׳›׳ ׳׳•׳¦׳׳•׳× ׳׳”׳“׳•׳׳¨ ׳”׳ ׳›׳ ׳¡ ׳•׳׳§׳‘׳׳•׳× ׳×׳™׳§׳™׳™׳” ׳׳©׳׳”׳.
    query = query.eq('is_chat', folder === 'CHAT')
    query = query.eq('source', 'resend')
    // ׳“׳•׳׳¨ ׳ ׳›׳ ׳¡ ׳¨׳’׳™׳ ג€” ׳”׳׳—׳׳§׳” ׳ ׳’׳–׳¨׳× ׳׳›׳×׳•׳‘׳× ׳”׳ ׳׳¢׳
    if (effectiveEmails.length === 1) query = query.eq('to_email', effectiveEmails[0])
    else if (effectiveEmails.length > 1) query = query.in('to_email', effectiveEmails)
  }
  if (q) { const s = safeLike(q); query = query.or(`subject.ilike.%${s}%,from_email.ilike.%${s}%,from_name.ilike.%${s}%`) }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ׳”׳©׳•׳¨׳” ׳”-51 (׳׳ ׳§׳™׳™׳׳×) ׳׳¡׳׳ ׳× ׳©׳™׳© ׳¢׳׳•׳“ ׳”׳‘׳ ג€” ׳—׳•׳×׳›׳™׳ ׳׳•׳×׳” ׳•׳׳—׳–׳™׳¨׳™׳ hasMore.
  const rows = data ?? []
  const hasMore = rows.length > PAGE_SIZE
  const messages = rows.slice(0, PAGE_SIZE).map(m => ({
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
    beneficiaryId: m.beneficiary_id ?? null,
  }))

  // ׳׳™׳™׳׳™׳ ׳©׳¡׳•׳׳ ׳• ׳׳˜׳™׳₪׳•׳ ׳•׳–׳׳ ׳ ׳”׳’׳™׳¢ ג€” ׳§׳•׳₪׳¦׳™׳ ׳׳¨׳׳© ׳”׳¨׳©׳™׳׳” (׳”׳¢׳“׳›׳ ׳™-׳‘׳™׳•׳×׳¨-׳׳˜׳™׳₪׳•׳ ׳¨׳׳©׳•׳)
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

  return NextResponse.json({ messages, page, pageSize: PAGE_SIZE, hasMore })
}
