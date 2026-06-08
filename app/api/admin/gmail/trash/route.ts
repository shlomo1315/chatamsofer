import { NextResponse, type NextRequest } from 'next/server'
import { getGmailClient } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const { id } = await request.json()
  try {
    const gmail = await getGmailClient()
    await gmail.users.messages.trash({ userId: 'me', id })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
