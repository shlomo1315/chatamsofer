import { NextResponse, type NextRequest } from 'next/server'
import { requireMailAccess, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { getGmailClientForToken } from '@/lib/gmail'
import {
  checkDraftConflict, isDraftEmpty, reconcileDrafts, encodeDraftMime, CONFLICT_MESSAGE,
  type DraftRow, type RemoteDraft,
} from '@/lib/gmailDrafts'

export const dynamic = 'force-dynamic'

// ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
// ׳˜׳™׳•׳˜׳•׳× ג€” ׳¡׳ ׳›׳¨׳•׳ ׳“׳•-׳›׳™׳•׳•׳ ׳™ ׳׳•׳ Gmail.
//
// נ”´ ׳˜׳™׳•׳˜׳” ׳ ׳¢׳¨׳›׳× ׳‘׳©׳ ׳™ ׳׳§׳•׳׳•׳× ׳‘׳•-׳–׳׳ ׳™׳×: ׳‘׳×׳•׳›׳ ׳” ׳•׳‘׳˜׳׳₪׳•׳. ׳׳™׳ ׳“׳¨׳ ׳׳׳–׳’ ׳©׳ ׳™
// ׳˜׳§׳¡׳˜׳™׳ ׳©׳ ׳›׳×׳‘׳• ׳‘׳׳§׳‘׳™׳, ׳•׳׳›׳ ׳”׳”׳›׳¨׳¢׳” ׳›׳׳ ׳”׳™׳ **׳”׳׳׳•׳—׳¨ ׳’׳•׳‘׳¨ ג€” ׳׳‘׳ ׳׳ ׳‘׳©׳§׳˜**:
// ׳›׳©׳”׳’׳¨׳¡׳” ׳”׳׳¨׳•׳—׳§׳× ׳”׳×׳§׳“׳׳”, ׳”׳׳©׳×׳׳© ׳׳§׳‘׳ ׳׳–׳”׳¨׳” ׳•׳‘׳•׳—׳¨, ׳•׳׳ ׳׳’׳׳” ׳‘׳“׳™׳¢׳‘׳“ ׳©׳׳”
// ׳©׳›׳×׳‘ ׳ ׳׳—׳§.
//
// GET    ג€” ׳¨׳©׳™׳׳× ׳”׳˜׳™׳•׳˜׳•׳× (׳׳¡׳•׳ ׳›׳¨׳ ׳× ׳-Gmail).
// POST   ג€” ׳™׳¦׳™׳¨׳”/׳©׳׳™׳¨׳”. ?force=1 ׳׳“׳¨׳™׳¡׳” ׳׳•׳“׳¢׳× ׳׳—׳¨׳™ ׳׳–׳”׳¨׳× ׳”׳×׳ ׳’׳©׳•׳×.
// DELETE ג€” ׳׳—׳™׳§׳” ׳‘׳©׳ ׳™ ׳”׳¦׳“׳“׳™׳.
// ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const COLS = 'draft_id, message_id, thread_id, to_email, subject, body, updated_at, base_revision'

async function activeAccount(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { data } = await db.from('gmail_accounts')
    .select('id, email, refresh_token').eq('is_active', true).limit(1).maybeSingle()
  return data as { id: string; email: string; refresh_token: string } | null
}

export async function GET() {
  const staff = await requireMailAccess()
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: '׳©׳’׳™׳׳× ׳©׳¨׳×' }, { status: 500 })

  const acc = await activeAccount(db)
  if (!acc) return NextResponse.json({ drafts: [] })

  const { data: localData } = await db.from('gmail_drafts').select(COLS).eq('account_id', acc.id)
  const local = (localData ?? []) as DraftRow[]

  try {
    const gmail = getGmailClientForToken(acc.refresh_token)
    const res = await gmail.users.drafts.list({ userId: 'me', maxResults: 100 })
    const remote = (res.data?.drafts ?? []) as RemoteDraft[]

    const { removedLocally } = reconcileDrafts(local, remote)
    // ג ן¸ ׳˜׳™׳•׳˜׳” ׳©׳ ׳¢׳׳׳” ׳-Gmail ׳ ׳׳—׳§׳× ׳׳§׳•׳׳™׳× ׳•׳׳™׳ ׳” ׳ ׳©׳׳¨׳× "׳׳™׳×׳¨ ׳‘׳™׳˜׳—׳•׳":
    // ׳˜׳™׳•׳˜׳•׳× ׳©׳—׳•׳–׳¨׳•׳× ׳‘׳›׳ ׳¡׳ ׳›׳¨׳•׳ ׳’׳•׳¨׳׳•׳× ׳׳׳©׳×׳׳© ׳׳׳‘׳“ ׳׳׳•׳ ׳‘׳׳¢׳¨׳›׳×.
    if (removedLocally.length) {
      await db.from('gmail_drafts').delete().in('draft_id', removedLocally)
    }

    // ג ן¸ ׳׳–׳”׳” ׳”׳”׳•׳“׳¢׳” ׳׳×׳¢׳“׳›׳ ׳-Gmail ׳’׳ ׳‘׳׳™ ׳׳₪׳×׳•׳— ׳׳× ׳”׳˜׳™׳•׳˜׳”: ׳”׳•׳ ׳—׳•׳×׳׳×
    // ׳”׳’׳¨׳¡׳”, ׳•׳‘׳׳¢׳“׳™׳• ׳׳ ׳ ׳–׳”׳” ׳©׳”׳™׳ ׳ ׳¢׳¨׳›׳” ׳‘׳˜׳׳₪׳•׳.
    for (const r of remote) {
      const msgId = r.message?.id ? String(r.message.id) : null
      if (msgId) await db.from('gmail_drafts').update({ message_id: msgId }).eq('draft_id', r.id)
    }

    const { data: fresh } = await db.from('gmail_drafts').select(COLS)
      .eq('account_id', acc.id).order('updated_at', { ascending: false })
    return NextResponse.json({ drafts: fresh ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    // ג ן¸ ׳›׳©׳ ׳׳•׳ Gmail ׳׳—׳–׳™׳¨ ׳׳× ׳”׳׳§׳•׳׳™ ׳•׳׳ ׳¨׳©׳™׳׳” ׳¨׳™׳§׳”: ׳˜׳™׳•׳˜׳” ׳©׳ ׳›׳×׳‘׳” ׳•׳׳
    // ׳ ׳¨׳׳™׳× ׳”׳™׳ ׳‘׳“׳™׳•׳§ ׳”׳׳¦׳‘ ׳©׳’׳•׳¨׳ ׳׳׳©׳×׳׳© ׳׳›׳×׳•׳‘ ׳׳•׳×׳” ׳©׳•׳‘.
    console.error('[drafts] ׳¡׳ ׳›׳¨׳•׳ ׳ ׳›׳©׳, ׳׳•׳—׳–׳¨ ׳”׳׳§׳•׳׳™:', e instanceof Error ? e.message : e)
    return NextResponse.json({ drafts: local, stale: true })
  }
}

export async function POST(request: NextRequest) {
  const staff = await requireMailAccess()
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: '׳©׳’׳™׳׳× ׳©׳¨׳×' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as {
    draft_id?: string; to?: string; subject?: string; body?: string
    thread_id?: string; base_revision?: string | null; force?: boolean
  }

  if (isDraftEmpty({ to_email: body.to, subject: body.subject, body: body.body })) {
    return NextResponse.json({ error: '׳”׳˜׳™׳•׳˜׳” ׳¨׳™׳§׳”' }, { status: 400 })
  }

  const acc = await activeAccount(db)
  if (!acc) return NextResponse.json({ error: '׳׳™׳ ׳×׳™׳‘׳× Gmail ׳₪׳¢׳™׳׳”' }, { status: 404 })

  const gmail = getGmailClientForToken(acc.refresh_token)
  const draftId = String(body.draft_id ?? '')

  // ג”€ג”€ ׳‘׳“׳™׳§׳× ׳”׳×׳ ׳’׳©׳•׳× ׳׳₪׳ ׳™ ׳›׳×׳™׳‘׳” ג”€ג”€
  if (draftId && !body.force) {
    let remoteMsgId: string | null = null
    try {
      const cur = await gmail.users.drafts.get({ userId: 'me', id: draftId, format: 'minimal' })
      remoteMsgId = cur.data?.message?.id ? String(cur.data.message.id) : null
    } catch {
      remoteMsgId = null   // ׳ ׳׳—׳§׳” ׳‘׳¦׳“ ׳”׳©׳ ׳™
    }
    const conflict = checkDraftConflict(body.base_revision ?? null, remoteMsgId)
    if (conflict.kind !== 'none') {
      // נ”´ 409 ׳•׳׳ ׳›׳×׳™׳‘׳”: ׳”׳׳©׳×׳׳© ׳—׳™׳™׳‘ ׳׳‘׳—׳•׳¨. ׳“׳¨׳™׳¡׳” ׳©׳§׳˜׳” ׳›׳׳ ׳׳•׳—׳§׳× ׳˜׳§׳¡׳˜
      // ׳©׳ ׳›׳×׳‘ ׳‘׳׳§׳•׳ ׳׳—׳¨, ׳•׳׳™׳ ׳׳׳ ׳” ׳“׳¨׳ ׳—׳–׳¨׳”.
      return NextResponse.json({
        conflict: conflict.kind,
        message: CONFLICT_MESSAGE[conflict.kind],
        remoteRevision: conflict.kind === 'remote-changed' ? conflict.remoteRevision : null,
      }, { status: 409 })
    }
  }

  const raw = encodeDraftMime({ to: body.to, subject: body.subject, body: body.body, from: acc.email })

  try {
    const payload = {
      userId: 'me',
      requestBody: {
        ...(draftId ? { id: draftId } : {}),
        message: { raw, ...(body.thread_id ? { threadId: body.thread_id } : {}) },
      },
    }
    const res = draftId
      ? await gmail.users.drafts.update({ ...payload, id: draftId })
      : await gmail.users.drafts.create(payload)

    const newDraftId = String(res.data?.id ?? draftId)
    const newMsgId = res.data?.message?.id ? String(res.data.message.id) : null
    const now = new Date().toISOString()

    await db.from('gmail_drafts').upsert({
      draft_id: newDraftId,
      account_id: acc.id,
      message_id: newMsgId,
      thread_id: body.thread_id ?? res.data?.message?.threadId ?? null,
      to_email: body.to ?? null,
      subject: body.subject ?? null,
      body: body.body ?? null,
      // ג ן¸ ׳”׳‘׳¡׳™׳¡ ׳׳×׳¢׳“׳›׳ ׳׳׳” ׳©׳ ׳›׳×׳‘ *׳¢׳›׳©׳™׳•*, ׳׳—׳¨׳× ׳”׳©׳׳™׳¨׳” ׳”׳‘׳׳” ׳”׳™׳™׳×׳” ׳׳“׳•׳•׳—׳×
      // ׳”׳×׳ ׳’׳©׳•׳× ׳׳•׳ ׳”׳¢׳¨׳™׳›׳” ׳©׳ ׳”׳׳©׳×׳׳© ׳¢׳¦׳׳•.
      base_revision: newMsgId,
      updated_at: now,
      synced_at: now,
    }, { onConflict: 'draft_id' })

    return NextResponse.json({ ok: true, draft_id: newDraftId, revision: newMsgId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[drafts] ׳©׳׳™׳¨׳” ׳ ׳›׳©׳׳”:', msg)
    return NextResponse.json({ error: '׳©׳׳™׳¨׳× ׳”׳˜׳™׳•׳˜׳” ׳ ׳›׳©׳׳”' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const staff = await requireMailAccess()
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: '׳©׳’׳™׳׳× ׳©׳¨׳×' }, { status: 500 })

  const draftId = request.nextUrl.searchParams.get('draft_id') ?? ''
  if (!draftId) return NextResponse.json({ error: '׳—׳¡׳¨ ׳׳–׳”׳”' }, { status: 400 })

  const acc = await activeAccount(db)
  if (acc) {
    try {
      await getGmailClientForToken(acc.refresh_token).users.drafts.delete({ userId: 'me', id: draftId })
    } catch (e) {
      // ג ן¸ ׳˜׳™׳•׳˜׳” ׳©׳›׳‘׳¨ ׳׳™׳ ׳” ׳‘-Gmail ׳׳™׳ ׳” ׳©׳’׳™׳׳” ג€” ׳׳׳©׳™׳›׳™׳ ׳׳׳—׳•׳§ ׳׳§׳•׳׳™׳×,
      // ׳׳—׳¨׳× ׳”׳™׳ ׳ ׳©׳׳¨׳× ׳×׳§׳•׳¢׳” ׳‘׳׳¡׳ ׳׳ ׳¦׳—.
      console.warn('[drafts] ׳׳—׳™׳§׳” ׳-Gmail ׳ ׳›׳©׳׳”:', e instanceof Error ? e.message : e)
    }
  }
  await db.from('gmail_drafts').delete().eq('draft_id', draftId)
  return NextResponse.json({ ok: true })
}
