import { NextResponse, type NextRequest } from 'next/server'
import { requireMailAccess, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { getGmailClientForToken, parseMessage, getBody } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

// ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
// ׳×׳™׳‘׳× ׳”׳“׳•׳׳¨ ג€” ׳ ׳‘׳ ׳™׳× ׳¢׳ ׳”׳׳™׳ ׳“׳§׳¡, ׳׳ ׳¢׳ Gmail API.
//
// נ”´ ׳–׳” ׳”׳”׳‘׳“׳ ׳׳”׳׳¡׳ ׳”׳™׳©׳: ׳¨׳©׳™׳׳× ׳”׳”׳•׳“׳¢׳•׳× ׳ ׳©׳׳₪׳× ׳׳”׳׳¡׳“ (׳׳™׳™׳“׳™, ׳ ׳™׳×׳ ׳׳—׳™׳₪׳•׳©
// ׳•׳׳¡׳™׳ ׳•׳ ׳׳₪׳™ ׳׳—׳׳§׳”), ׳•׳¨׳§ *׳’׳•׳£ ׳”׳”׳•׳“׳¢׳”* ׳ ׳׳©׳ ׳-Gmail ג€” ׳•׳¨׳§ ׳›׳©׳₪׳•׳×׳—׳™׳ ׳׳•׳×׳”.
//
// ג ן¸ ׳”׳׳¡׳ ׳”׳™׳©׳ ׳§׳¨׳ ׳׳× ׳›׳ ׳”׳×׳™׳‘׳” ׳-Gmail ׳‘׳›׳ ׳˜׳¢׳™׳ ׳”, ׳•׳׳›׳ ׳”׳™׳” ׳׳™׳˜׳™, ׳׳ ׳™׳“׳¢
// ׳׳—׳₪׳© ׳׳₪׳™ ׳׳•׳˜׳‘, ׳•׳׳ ׳™׳›׳•׳ ׳”׳™׳” ׳׳”׳¦׳™׳’ ׳׳—׳׳§׳”. ׳”׳׳™׳ ׳“׳§׳¡ ׳₪׳•׳×׳¨ ׳׳× ׳©׳׳•׳©׳×׳.
//
// ג ן¸ ׳”׳’׳•׳£ ׳׳¢׳•׳׳ ׳׳™׳ ׳• ׳ ׳©׳׳¨ ׳‘׳׳¡׳“. ׳”׳•׳ ׳ ׳׳©׳ ׳‘׳›׳ ׳₪׳×׳™׳—׳” ג€” ׳›׳ ׳׳™׳ ׳¢׳•׳×׳§ ׳©׳ ׳™ ׳©׳™׳›׳•׳
// ׳׳¡׳×׳•׳¨ ׳׳× Gmail, ׳•׳–׳• ׳›׳ ׳”׳¡׳™׳‘׳” ׳©׳”׳׳¢׳‘׳¨ ׳”׳–׳” ׳ ׳¢׳©׳”.
//
// GET ?folder=inbox|sent&department=&q=&page=  ג€” ׳¨׳©׳™׳׳”
// GET ?id=<gmail_message_id>                    ג€” ׳”׳•׳“׳¢׳” ׳׳׳׳” (׳’׳•׳£ ׳-Gmail)
// ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const PAGE_SIZE = 50

const LIST_COLS =
  'gmail_message_id, thread_id, from_email, from_name, to_email, original_to, ' +
  'subject, snippet, sent_at, has_attachments, is_unread, labels, department, beneficiary_id, account_id'

export async function GET(request: NextRequest) {
  const staff = await requireMailAccess()
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: '׳©׳’׳™׳׳× ׳©׳¨׳×' }, { status: 500 })

  const sp = request.nextUrl.searchParams
  const messageId = sp.get('id')

  // ג”€ג”€ ׳”׳•׳“׳¢׳” ׳‘׳•׳“׳“׳×: ׳׳˜׳-׳“׳׳˜׳” ׳׳”׳׳™׳ ׳“׳§׳¡ + ׳’׳•׳£ ׳-Gmail ג”€ג”€
  if (messageId) {
    const { data } = await db.from('gmail_messages')
      .select(LIST_COLS).eq('gmail_message_id', messageId).maybeSingle()
    if (!data) return NextResponse.json({ error: 'ההודעה לא נמצאה' }, { status: 404 })

    const row = data as unknown as Record<string, unknown>
    const { data: acc } = await db.from('gmail_accounts')
      .select('refresh_token').eq('id', String(row.account_id ?? '')).maybeSingle()
    const token = (acc as { refresh_token?: string } | null)?.refresh_token

    let body = ''
    let attachments: unknown[] = []
    if (token) {
      try {
        const gmail = getGmailClientForToken(token)
        const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })
        body = getBody(res.data?.payload)
        attachments = parseMessage(res.data).attachments ?? []
      } catch (e) {
        // ג ן¸ ׳›׳©׳ ׳‘׳׳©׳™׳›׳× ׳”׳’׳•׳£ ׳׳™׳ ׳• ׳׳¡׳×׳™׳¨ ׳׳× ׳”׳”׳•׳“׳¢׳”: ׳”׳׳˜׳-׳“׳׳˜׳” ׳׳•׳¦׳’׳× ׳¢׳
        // ׳”׳•׳“׳¢׳× ׳©׳’׳™׳׳”, ׳›׳“׳™ ׳©׳™׳”׳™׳” ׳‘׳¨׳•׳¨ ׳©׳”׳”׳•׳“׳¢׳” ׳§׳™׳™׳׳× ׳•׳”׳‘׳¢׳™׳” ׳”׳™׳ ׳‘׳˜׳¢׳™׳ ׳”.
        console.error('[inbox] ׳׳©׳™׳›׳× ׳’׳•׳£ ׳ ׳›׳©׳׳”:', e instanceof Error ? e.message : e)
        return NextResponse.json({ message: row, body: '', attachments: [], bodyError: '׳˜׳¢׳™׳ ׳× ׳×׳•׳›׳ ׳”׳”׳•׳“׳¢׳” ׳ ׳›׳©׳׳”' })
      }
    }

    // ג ן¸ ׳¡׳™׳׳•׳ ׳›׳ ׳§׳¨׳ ׳׳×׳‘׳¦׳¢ ׳‘-Gmail *׳•׳’׳* ׳‘׳׳™׳ ׳“׳§׳¡. ׳¢׳“׳›׳•׳ ׳”׳׳™׳ ׳“׳§׳¡ ׳‘׳׳‘׳“ ׳”׳™׳”
    // ׳׳×׳ ׳’׳© ׳¢׳ ׳”׳¡׳ ׳›׳¨׳•׳ ׳”׳‘׳, ׳©׳׳•׳©׳ ׳׳× ׳׳¦׳‘ ׳”׳׳׳× ׳-Gmail ׳•׳׳—׳–׳™׳¨ ׳׳•׳×׳• ׳׳׳-׳ ׳§׳¨׳.
    if (row.is_unread === true && token) {
      try {
        await getGmailClientForToken(token).users.messages.modify({
          userId: 'me', id: messageId, requestBody: { removeLabelIds: ['UNREAD'] },
        })
        await db.from('gmail_messages').update({ is_unread: false }).eq('gmail_message_id', messageId)
      } catch { /* best-effort ג€” ׳”׳§׳¨׳™׳׳” ׳¢׳¦׳׳” ׳—׳©׳•׳‘׳” ׳™׳•׳×׳¨ ׳׳”׳¡׳™׳׳•׳ */ }
    }

    return NextResponse.json({ message: row, body, attachments })
  }

  // ג”€ג”€ ׳¨׳©׳™׳׳” ג”€ג”€
  const folder = sp.get('folder') ?? 'inbox'
  const department = sp.get('department') ?? ''
  const q = (sp.get('q') ?? '').trim()
  const page = Math.max(0, Number(sp.get('page') ?? 0) || 0)

  let query = db.from('gmail_messages')
    .select(LIST_COLS, { count: 'exact' })
    .is('deleted_at', null)

  // ג ן¸ ׳”׳¡׳™׳ ׳•׳ ׳׳₪׳™ ׳×׳•׳•׳™׳•׳× Gmail ׳•׳׳ ׳׳₪׳™ ׳©׳“׳” ׳׳©׳׳ ׳•: ׳”׳×׳•׳•׳™׳•׳× ׳”׳ ׳׳§׳•׳¨ ׳”׳׳׳×,
  // ׳•׳”׳ ׳׳×׳¢׳“׳›׳ ׳•׳× ׳‘׳›׳ ׳¡׳ ׳›׳¨׳•׳. ׳©׳“׳” ׳ ׳’׳–׳¨ ׳”׳™׳” ׳׳×׳™׳™׳©׳.
  if (folder === 'sent') query = query.contains('labels', ['SENT'])
  else if (folder === 'unread') query = query.eq('is_unread', true).contains('labels', ['INBOX'])
  else if (folder === 'followup') query = query.contains('labels', ['לטיפול'])
  else if (folder === 'starred') query = query.contains('labels', ['STARRED'])
  else if (folder === 'all') { /* ׳”׳›׳ ג€” ׳‘׳׳™ ׳¡׳™׳ ׳•׳ ׳×׳•׳•׳™׳× */ }
  else query = query.contains('labels', ['INBOX'])

  if (department) query = query.eq('department', department)
  // ג ן¸ ׳¡׳™׳ ׳•׳ ׳׳₪׳™ ׳×׳™׳‘׳”: ׳›׳©׳׳—׳•׳‘׳¨׳•׳× ׳›׳׳” ׳×׳™׳‘׳•׳×, "׳“׳•׳׳¨ ׳ ׳›׳ ׳¡" ׳׳¢׳¨׳‘׳‘ ׳׳× ׳›׳•׳׳
  // ׳•׳׳™ ׳׳₪׳©׳¨ ׳׳¢׳‘׳•׳“ ׳¢׳ ׳×׳™׳‘׳” ׳׳—׳×.
  const accountId = sp.get('account') ?? ''
  if (accountId) query = query.eq('account_id', accountId)

  // ׳×׳•׳•׳™׳× Gmail ׳¡׳₪׳¦׳™׳₪׳™׳× (׳׳”׳₪׳׳ ׳ ׳”׳¦׳“׳“׳™).
  const label = sp.get('label') ?? ''
  if (label) query = query.contains('labels', [label])

  if (q) {
    // ג ן¸ ׳—׳™׳₪׳•׳© ׳¢׳ ׳׳˜׳-׳“׳׳˜׳” ׳‘׳׳‘׳“ ג€” ׳”׳’׳•׳£ ׳׳™׳ ׳• ׳‘׳׳¡׳“. ׳–׳” ׳׳›׳•׳•׳: ׳—׳™׳₪׳•׳© ׳‘׳’׳•׳£
    // ׳׳—׳™׳™׳‘ ׳©׳׳™׳¨׳× ׳¢׳•׳×׳§, ׳•׳–׳• ׳‘׳“׳™׳•׳§ ׳”׳›׳₪׳™׳׳•׳× ׳©׳”׳׳¢׳‘׳¨ ׳ ׳•׳¢׳“ ׳׳¡׳׳§.
    const safe = q.replace(/[%,()]/g, ' ')
    query = query.or(
      `subject.ilike.%${safe}%,from_email.ilike.%${safe}%,from_name.ilike.%${safe}%,snippet.ilike.%${safe}%`,
    )
  }

  const { data, count, error } = await query
    .order('sent_at', { ascending: false, nullsFirst: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (error) {
    console.error('[inbox] שליפה נכשלה:', error.message)
    return NextResponse.json({ error: '׳©׳׳™׳₪׳× ׳”׳”׳•׳“׳¢׳•׳× ׳ ׳›׳©׳׳”' }, { status: 500 })
  }

  // ׳׳•׳ ׳” ׳׳-׳ ׳§׳¨׳׳™׳ ׳׳›׳ ׳׳—׳׳§׳” ׳•׳׳›׳ ׳×׳™׳‘׳” ג€” ׳׳×׳’׳™׳•׳× ׳‘׳₪׳׳ ׳ ׳”׳¦׳“׳“׳™.
  const { data: unreadRows } = await db.from('gmail_messages')
    .select('department, account_id').eq('is_unread', true).is('deleted_at', null).contains('labels', ['INBOX'])
  const unreadByDept: Record<string, number> = {}
  const unreadByAccount: Record<string, number> = {}
  for (const r of (unreadRows ?? []) as { department?: string | null; account_id?: string | null }[]) {
    const k = r.department || '_none'
    unreadByDept[k] = (unreadByDept[k] ?? 0) + 1
    if (r.account_id) unreadByAccount[r.account_id] = (unreadByAccount[r.account_id] ?? 0) + 1
  }

  // ג”€ג”€ ׳”׳×׳™׳‘׳•׳× ׳•׳”׳×׳•׳•׳™׳•׳× ׳׳₪׳׳ ׳ ׳”׳¦׳“׳“׳™ ג”€ג”€
  const { data: accounts } = await db.from('gmail_accounts')
    .select('id, email, label, department').eq('is_active', true).order('email')

  // ג ן¸ ׳”׳×׳•׳•׳™׳•׳× ׳ ׳’׳–׳¨׳•׳× ׳׳”׳׳™׳ ׳“׳§׳¡ ׳•׳׳ ׳ ׳©׳׳₪׳•׳× ׳-Gmail ׳‘׳›׳ ׳˜׳¢׳™׳ ׳”: ׳©׳׳™׳₪׳” ׳׳©׳
  // ׳”׳™׳™׳×׳” ׳׳•׳¡׳™׳₪׳” ׳¡׳‘׳‘ ׳¨׳©׳× ׳׳›׳ ׳¨׳¢׳ ׳•׳, ׳•׳”׳×׳•׳•׳™׳•׳× ׳׳׳™׳׳ ׳׳¡׳•׳ ׳›׳¨׳ ׳•׳×.
  // ׳׳¡׳ ׳ ׳™׳ ׳×׳•׳•׳™׳•׳× ׳׳¢׳¨׳›׳× (INBOX, SENT, CATEGORY_*) ׳©׳׳™׳ ׳ ׳׳¢׳ ׳™׳™׳ ׳•׳× ׳‘׳×׳¦׳•׳’׳”.
  const SYSTEM = /^(INBOX|SENT|DRAFT|SPAM|TRASH|UNREAD|STARRED|IMPORTANT|CHAT|CATEGORY_)/
  const { data: labelRows } = await db.from('gmail_messages')
    .select('labels').is('deleted_at', null).limit(2000)
  const labelCounts: Record<string, number> = {}
  for (const r of (labelRows ?? []) as { labels?: string[] | null }[]) {
    for (const l of r.labels ?? []) {
      if (!l || SYSTEM.test(l)) continue
      labelCounts[l] = (labelCounts[l] ?? 0) + 1
    }
  }
  const labels = Object.entries(labelCounts)
    .map(([name, n]) => ({ name, count: n }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25)

  // ׳׳•׳ ׳” "לטיפול" ג€” ׳׳×׳’׳™׳× ׳‘׳₪׳׳ ׳.
  const { count: followupCount } = await db.from('gmail_messages')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null).contains('labels', ['לטיפול'])

  return NextResponse.json({
    messages: data ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    hasMore: (count ?? 0) > (page + 1) * PAGE_SIZE,
    unreadByDept,
    unreadByAccount,
    accounts: accounts ?? [],
    labels,
    followupCount: followupCount ?? 0,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
