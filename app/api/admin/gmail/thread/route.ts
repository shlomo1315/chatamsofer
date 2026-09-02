import { NextResponse, type NextRequest } from 'next/server'
import { getGmailClient, parseMessage } from '@/lib/gmail'
import { requireMailAccess, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { canAccessGmailThread } from '@/lib/mailAccess'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const staff = await requireMailAccess()
  if (!staff) return unauthorized()

  const threadId = request.nextUrl.searchParams.get('id')
  if (!threadId) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  // 🔴 בעלות-מחלקה: מזהה שרשור הספיק כדי לקרוא התכתבות מלאה של כל מחלקה.
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  if (!(await canAccessGmailThread(db, staff, threadId))) {
    return NextResponse.json({ error: 'השרשור לא נמצא' }, { status: 404 })
  }

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
