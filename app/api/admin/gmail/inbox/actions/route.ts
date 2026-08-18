import { NextResponse, type NextRequest } from 'next/server'
import { requireMailAccess, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { getGmailClientForToken, sendGmailMessage } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

// ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
// ׳₪׳¢׳•׳׳•׳× ׳¢׳ ׳”׳•׳“׳¢׳•׳× ג€” ׳©׳׳™׳—׳”, ׳¡׳™׳׳•׳ ׳ ׳§׳¨׳, ׳×׳•׳•׳™׳•׳×, ׳׳—׳™׳§׳”.
//
// נ”´ ׳›׳ ׳₪׳¢׳•׳׳” ׳ ׳›׳×׳‘׳× ׳-Gmail *׳•׳’׳* ׳׳׳™׳ ׳“׳§׳¡. ׳›׳×׳™׳‘׳” ׳׳׳™׳ ׳“׳§׳¡ ׳‘׳׳‘׳“ ׳”׳™׳™׳×׳” ׳ ׳׳—׳§׳×
// ׳‘׳¡׳ ׳›׳¨׳•׳ ׳”׳‘׳, ׳©׳׳•׳©׳ ׳׳× ׳׳¦׳‘ ׳”׳׳׳× ׳-Gmail ג€” ׳•׳”׳׳©׳×׳׳© ׳”׳™׳” ׳¨׳•׳׳” ׳׳× ׳”׳¡׳™׳׳•׳ ׳©׳׳•
// ׳ ׳¢׳׳ ׳‘׳׳™ ׳”׳¡׳‘׳¨. Gmail ׳”׳•׳ ׳׳§׳•׳¨ ׳”׳׳׳×, ׳•׳”׳׳™׳ ׳“׳§׳¡ ׳׳©׳§׳£ ׳׳•׳×׳•.
//
// ג ן¸ ׳”׳¡׳“׳¨ ׳§׳‘׳•׳¢: ׳§׳•׳“׳ Gmail, ׳•׳¨׳§ ׳׳—׳¨׳™ ׳”׳¦׳׳—׳” ג€” ׳”׳׳™׳ ׳“׳§׳¡. ׳”׳₪׳•׳ ׳”׳™׳” ׳׳™׳™׳¦׳¨ ׳׳¦׳‘
// ׳©׳‘׳• ׳”׳׳¡׳ ׳׳¨׳׳” "׳ ׳§׳¨׳" ׳‘׳¢׳•׳“ ׳©׳‘׳˜׳׳₪׳•׳ ׳”׳”׳•׳“׳¢׳” ׳¢׳“׳™׳™׳ ׳׳•׳“׳’׳©׳×.
// ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

/** ׳”׳×׳•׳•׳™׳× ׳©׳׳¡׳׳ ׳× "לטיפול ׳‘׳”׳׳©׳" ג€” ׳ ׳•׳¦׳¨׳× ׳‘-Gmail ׳‘׳₪׳¢׳ ׳”׳¨׳׳©׳•׳ ׳”. */
const FOLLOWUP_LABEL = 'לטיפול'

async function accountFor(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  messageId?: string,
): Promise<{ id: string; email: string; refresh_token: string } | null> {
  if (messageId) {
    const { data: msg } = await db.from('gmail_messages')
      .select('account_id').eq('gmail_message_id', messageId).maybeSingle()
    const accId = (msg as { account_id?: string } | null)?.account_id
    if (accId) {
      const { data } = await db.from('gmail_accounts')
        .select('id, email, refresh_token').eq('id', accId).maybeSingle()
      if (data) return data as { id: string; email: string; refresh_token: string }
    }
  }
  const { data } = await db.from('gmail_accounts')
    .select('id, email, refresh_token').eq('is_active', true).limit(1).maybeSingle()
  return (data as { id: string; email: string; refresh_token: string } | null) ?? null
}

/** ׳׳•׳¦׳ ׳׳• ׳™׳•׳¦׳¨ ׳×׳•׳•׳™׳× ׳‘-Gmail ׳•׳׳—׳–׳™׳¨ ׳׳× ׳”׳׳–׳”׳” ׳©׳׳”. */
async function labelId(gmail: ReturnType<typeof getGmailClientForToken>, name: string): Promise<string | null> {
  try {
    const list = await gmail.users.labels.list({ userId: 'me' })
    const found = (list.data?.labels ?? []).find((l: { name?: string | null }) => l.name === name)
    if (found?.id) return String(found.id)
    const created = await gmail.users.labels.create({
      userId: 'me',
      requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
    })
    return created.data?.id ? String(created.data.id) : null
  } catch (e) {
    console.error('[inbox/actions] ׳×׳•׳•׳™׳× ׳ ׳›׳©׳׳”:', e instanceof Error ? e.message : e)
    return null
  }
}

interface Attachment { name: string; type: string; data: string }

interface Body {
  action: 'send' | 'reply' | 'mark-read' | 'mark-unread' | 'followup' | 'unfollowup' | 'trash' | 'archive'
  messageId?: string
  threadId?: string
  to?: string
  subject?: string
  html?: string
  attachments?: Attachment[]
  /** ׳”׳×׳™׳‘׳” ׳©׳׳׳ ׳” ׳׳©׳׳•׳— ג€” ׳׳‘׳—׳™׳¨׳× ׳”׳©׳•׳׳— ׳›׳©׳™׳© ׳›׳׳”. */
  accountId?: string
}

/** ׳›׳•׳×׳¨׳× ׳׳§׳•׳“׳“׳× ׳-UTF-8 ג€” ׳ ׳•׳©׳/׳©׳ ׳§׳•׳‘׳¥ ׳‘׳¢׳‘׳¨׳™׳× ׳׳’׳™׳¢ ׳›׳’'׳™׳‘׳¨׳™׳© ׳‘׳׳¢׳“׳™׳”. */
const enc = (s: string) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`

/**
 * ׳©׳׳™׳—׳” ׳¢׳ ׳¦׳™׳¨׳•׳₪׳™׳ ג€” multipart/mixed.
 *
 * ג ן¸ ׳ ׳₪׳¨׳“ ׳-sendGmailMessage ׳›׳™ ׳”׳׳‘׳ ׳” ׳©׳•׳ ׳” ׳׳’׳׳¨׳™: ׳”׳•׳“׳¢׳” ׳¢׳ ׳¦׳™׳¨׳•׳₪׳™׳ ׳—׳™׳™׳‘׳×
 * ׳’׳‘׳•׳ (boundary) ׳‘׳™׳ ׳”׳—׳׳§׳™׳, ׳•׳ ׳™׳¡׳™׳•׳ ׳׳”׳•׳¡׳™׳£ ׳¦׳™׳¨׳•׳£ ׳׳”׳•׳“׳¢׳” ׳₪׳©׳•׳˜׳” ׳©׳•׳‘׳¨ ׳׳×
 * ׳”-MIME ׳‘׳©׳§׳˜ ג€” ׳’׳׳™׳™׳ ׳©׳•׳׳—, ׳•׳”׳ ׳׳¢׳ ׳׳§׳‘׳ ׳”׳•׳“׳¢׳” ׳¨׳™׳§׳” ׳¢׳ ׳–׳‘׳.
 */
async function sendWithAttachments(
  gmail: ReturnType<typeof getGmailClientForToken>,
  o: { to: string; subject: string; html: string; from: string; threadId?: string; attachments: Attachment[] },
) {
  // ג ן¸ ׳’׳‘׳•׳ ׳׳§׳¨׳׳™ ׳׳¡׳₪׳™׳§ ׳›׳“׳™ ׳©׳׳ ׳™׳•׳₪׳™׳¢ ׳‘׳×׳•׳›׳. ׳”׳•׳₪׳¢׳” ׳׳§׳¨׳™׳× ׳©׳׳• ׳”׳™׳™׳×׳” ׳§׳•׳˜׳¢׳×
  // ׳׳× ׳”׳”׳•׳“׳¢׳” ׳‘׳׳׳¦׳¢.
  const boundary = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  const parts: string[] = [
    `From: ${enc('׳”׳™׳›׳ ׳”׳—׳×׳ ׳¡׳•׳₪׳¨')} <${o.from}>`,
    `To: ${o.to}`,
    `Reply-To: ${o.from}`,
    `Subject: ${enc(o.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(o.html, 'utf8').toString('base64'),
  ]

  for (const a of o.attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${a.type || 'application/octet-stream'}; name="${enc(a.name)}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${enc(a.name)}"`,
      '',
      a.data,
    )
  }
  parts.push(`--${boundary}--`, '')

  const raw = Buffer.from(parts.join('\r\n'), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: o.threadId || undefined },
  })
}

export async function POST(request: NextRequest) {
  const staff = await requireMailAccess()
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: '׳©׳’׳™׳׳× ׳©׳¨׳×' }, { status: 500 })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: '׳‘׳§׳©׳” ׳׳ ׳×׳§׳™׳ ׳”' }, { status: 400 }) }

  // ג ן¸ ׳×׳™׳‘׳× ׳”׳©׳׳™׳—׳” ׳ ׳‘׳—׳¨׳× ׳׳₪׳™ ׳”׳”׳•׳“׳¢׳” ׳©׳¢׳׳™׳” ׳₪׳•׳¢׳׳™׳, ׳•׳׳ ׳×׳׳™׳“ ׳”׳¨׳׳©׳•׳ ׳”: ׳×׳©׳•׳‘׳”
  // ׳׳×׳™׳‘׳× ׳¢׳–׳¨ ׳™׳•׳׳“׳•׳× ׳©׳ ׳©׳׳—׳” ׳׳”׳׳©׳¨׳“ ׳”׳¨׳׳©׳™ ׳׳’׳™׳¢׳” ׳׳׳©׳₪׳—׳” ׳׳”׳›׳×׳•׳‘׳× ׳”׳׳ ׳ ׳›׳•׳ ׳”.
  const acc = body.accountId
    ? await (async () => {
        const { data } = await db.from('gmail_accounts')
          .select('id, email, refresh_token').eq('id', body.accountId).maybeSingle()
        return data as { id: string; email: string; refresh_token: string } | null
      })()
    : await accountFor(db, body.messageId)

  if (!acc) return NextResponse.json({ error: '׳׳™׳ ׳×׳™׳‘׳× Gmail ׳₪׳¢׳™׳׳”' }, { status: 404 })
  const gmail = getGmailClientForToken(acc.refresh_token)

  try {
    switch (body.action) {
      // ג”€ג”€ ׳©׳׳™׳—׳” ׳•׳×׳©׳•׳‘׳” ג”€ג”€
      case 'send':
      case 'reply': {
        const to = String(body.to ?? '').trim()
        if (!to) return NextResponse.json({ error: '׳—׳¡׳¨׳” ׳›׳×׳•׳‘׳× ׳ ׳׳¢׳' }, { status: 400 })
        const subject = String(body.subject ?? '').trim() || '(ללא נושא)'
        const html = String(body.html ?? '')
        if (!html.replace(/<[^>]*>/g, '').trim()) {
          return NextResponse.json({ error: 'ההודעה ריקה' }, { status: 400 })
        }
        // ג ן¸ threadId ׳‘׳×׳©׳•׳‘׳” ׳‘׳׳‘׳“: ׳‘׳”׳•׳“׳¢׳” ׳—׳“׳©׳” ׳”׳•׳ ׳”׳™׳” ׳׳©׳¨׳©׳¨ ׳׳•׳×׳” ׳׳©׳™׳—׳”
        // ׳׳§׳¨׳׳™׳×, ׳•׳”׳”׳•׳“׳¢׳” ׳”׳™׳™׳×׳” ׳ ׳¢׳׳׳× ׳‘׳×׳•׳ ׳©׳¨׳©׳•׳¨ ׳©׳׳™׳ ׳• ׳§׳©׳•׳¨ ׳׳׳™׳”.
        const atts = Array.isArray(body.attachments) ? body.attachments : []
        if (atts.length) {
          await sendWithAttachments(gmail, {
            to, subject, html, from: acc.email,
            threadId: body.action === 'reply' ? body.threadId : undefined,
            attachments: atts,
          })
        } else {
          await sendGmailMessage(gmail, {
            to, subject, html,
            threadId: body.action === 'reply' ? body.threadId : undefined,
            from: acc.email,
            replyTo: acc.email,
          })
        }
        console.log(`[inbox/actions] נשלח מ-${acc.email} אל ${to}`)
        return NextResponse.json({ ok: true })
      }

      // ג”€ג”€ ׳׳¦׳‘ ׳§׳¨׳™׳׳” ג”€ג”€
      case 'mark-read':
      case 'mark-unread': {
        if (!body.messageId) return NextResponse.json({ error: 'חסר מזהה הודעה' }, { status: 400 })
        const unread = body.action === 'mark-unread'
        await gmail.users.messages.modify({
          userId: 'me', id: body.messageId,
          requestBody: unread ? { addLabelIds: ['UNREAD'] } : { removeLabelIds: ['UNREAD'] },
        })
        await db.from('gmail_messages')
          .update({ is_unread: unread }).eq('gmail_message_id', body.messageId)
        return NextResponse.json({ ok: true })
      }

      // ג”€ג”€ לטיפול ׳‘׳”׳׳©׳ ג”€ג”€
      case 'followup':
      case 'unfollowup': {
        if (!body.messageId) return NextResponse.json({ error: 'חסר מזהה הודעה' }, { status: 400 })
        const id = await labelId(gmail, FOLLOWUP_LABEL)
        if (!id) return NextResponse.json({ error: '׳™׳¦׳™׳¨׳× ׳”׳×׳•׳•׳™׳× ׳ ׳›׳©׳׳”' }, { status: 500 })
        const add = body.action === 'followup'
        await gmail.users.messages.modify({
          userId: 'me', id: body.messageId,
          requestBody: add ? { addLabelIds: [id] } : { removeLabelIds: [id] },
        })
        // ג ן¸ ׳”׳×׳•׳•׳™׳× ׳ ׳©׳׳¨׳× ׳’׳ ׳‘׳׳™׳ ׳“׳§׳¡ ׳›׳“׳™ ׳©׳”׳¡׳™׳ ׳•׳ ׳‘׳׳¡׳ ׳™׳¢׳‘׳•׳“ ׳‘׳׳™ ׳׳₪׳ ׳•׳×
        // ל-Gmail בכל טעינה.
        const { data: cur } = await db.from('gmail_messages')
          .select('labels').eq('gmail_message_id', body.messageId).maybeSingle()
        const labels = ((cur as { labels?: string[] } | null)?.labels ?? []).filter(l => l !== FOLLOWUP_LABEL)
        if (add) labels.push(FOLLOWUP_LABEL)
        await db.from('gmail_messages').update({ labels }).eq('gmail_message_id', body.messageId)
        return NextResponse.json({ ok: true })
      }

      // ג”€ג”€ ׳׳—׳™׳§׳” / ׳׳¨׳›׳•׳‘ ג”€ג”€
      case 'trash':
      case 'archive': {
        if (!body.messageId) return NextResponse.json({ error: 'חסר מזהה הודעה' }, { status: 400 })
        if (body.action === 'trash') {
          await gmail.users.messages.trash({ userId: 'me', id: body.messageId })
          // ג ן¸ ׳׳—׳™׳§׳” ׳¨׳›׳” ׳‘׳׳™׳ ׳“׳§׳¡: ׳”׳©׳™׳•׳ ׳׳›׳¨׳˜׳¡׳× ׳•׳”׳×׳™׳¢׳•׳“ ׳©׳ ׳‘׳ ׳• ׳¢׳ ׳”׳”׳•׳“׳¢׳”
          // ׳ ׳©׳׳¨׳™׳. ׳׳—׳™׳§׳” ׳§׳©׳” ׳”׳™׳™׳×׳” ׳׳•׳—׳§׳× ׳¢׳‘׳•׳“׳” ׳׳ ׳•׳©׳™׳×.
          await db.from('gmail_messages')
            .update({ deleted_at: new Date().toISOString() }).eq('gmail_message_id', body.messageId)
        } else {
          await gmail.users.messages.modify({
            userId: 'me', id: body.messageId, requestBody: { removeLabelIds: ['INBOX'] },
          })
          const { data: cur } = await db.from('gmail_messages')
            .select('labels').eq('gmail_message_id', body.messageId).maybeSingle()
          const labels = ((cur as { labels?: string[] } | null)?.labels ?? []).filter(l => l !== 'INBOX')
          await db.from('gmail_messages').update({ labels }).eq('gmail_message_id', body.messageId)
        }
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: '׳₪׳¢׳•׳׳” ׳׳ ׳׳•׳›׳¨׳×' }, { status: 400 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[inbox/actions] ${body.action} נכשל:`, msg)
    return NextResponse.json({ error: `הפעולה נכשלה: ${msg}` }, { status: 500 })
  }
}
