import { NextResponse, type NextRequest } from 'next/server'
import { getGmailClient, parseMessage } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const threadId = request.nextUrl.searchParams.get('id')
  if (!threadId) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  try {
    const gmail = await getGmailClient()
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    })
    const messages = (thread.data.messages ?? []).map(parseMessage)
    return NextResponse.json({ messages })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'Gmail not connected') return NextResponse.json({ notConnected: true }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
