import { NextResponse, type NextRequest } from 'next/server'
import { getGmailClient, parseMessage } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const folder = request.nextUrl.searchParams.get('folder') ?? 'INBOX'
  const q = request.nextUrl.searchParams.get('q') ?? ''
  const department = request.nextUrl.searchParams.get('department') ?? ''

  try {
    const { DEPARTMENTS } = await import('@/lib/departments')
    const deptEmail = department && DEPARTMENTS[department as keyof typeof DEPARTMENTS]?.email
    const deptFilter = deptEmail ? `(to:${deptEmail} OR from:${deptEmail})` : ''
    const combinedQ = [q, deptFilter].filter(Boolean).join(' ')

    const gmail = await getGmailClient()
    // folder=ALL → search all mail (no label filter), used for beneficiary threads
    const labelIds = folder === 'ALL' ? undefined
      : folder === 'SENT' ? ['SENT']
      : folder === 'INBOX' ? ['INBOX']
      : [folder]

    const list = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50,
      ...(labelIds ? { labelIds } : {}),
      q: combinedQ || undefined,
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
