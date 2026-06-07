import { NextResponse, type NextRequest } from 'next/server'
import { getGmailClient, parseMessage } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const folder = request.nextUrl.searchParams.get('folder') ?? 'INBOX'
  const q = request.nextUrl.searchParams.get('q') ?? ''

  try {
    const gmail = await getGmailClient()
    const labelIds = folder === 'SENT' ? ['SENT'] : folder === 'INBOX' ? ['INBOX'] : [folder]

    const list = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50,
      labelIds,
      q: q || undefined,
    })

    const ids = list.data.messages ?? []
    if (!ids.length) return NextResponse.json({ messages: [] })

    const messages = await Promise.all(
      ids.map(m => gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'full' }))
    )

    return NextResponse.json({ messages: messages.map(m => parseMessage(m.data)) })
  } catch (err: any) {
    if (err.message === 'Gmail not connected') return NextResponse.json({ notConnected: true }, { status: 401 })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
