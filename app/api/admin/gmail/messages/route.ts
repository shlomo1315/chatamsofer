import { NextResponse, type NextRequest } from 'next/server'
import { getGmailClient, parseMessage } from '@/lib/gmail'
import { requireMailAccess, unauthorized } from '@/lib/apiAuth'
import { allowedMailboxEmails } from '@/lib/mailAccess'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const staff = await requireMailAccess()
  if (!staff) return unauthorized()

  const folder = request.nextUrl.searchParams.get('folder') ?? 'INBOX'
  const q = request.nextUrl.searchParams.get('q') ?? ''
  const department = request.nextUrl.searchParams.get('department') ?? ''

  try {
    const { DEPARTMENTS } = await import('@/lib/departments')
    const deptEmail = department && DEPARTMENTS[department as keyof typeof DEPARTMENTS]?.email
    const deptFilter = deptEmail ? `(to:${deptEmail} OR from:${deptEmail})` : ''

    // ─────────────────────────────────────────────────────────────────────
    // 🔴 סינון התיבות המורשות נכפה על השאילתה — הוא אינו תלוי ב-department
    // שהקורא שלח.
    //
    // ⚠️ המסנן היחיד כאן היה הפרמטר מה-query string, ו-folder=ALL מסיר גם
    // את סינון התוויות. משתמש שפשוט לא שלח department קיבל חיפוש חופשי על
    // כל תיבות הארגון.
    //
    // ⚠️ נכשל-סגור: מי שאין לו אף תיבה מקבל רשימה ריקה ולא את הכול.
    // ─────────────────────────────────────────────────────────────────────
    const allowed = allowedMailboxEmails(staff)
    if (allowed !== null && allowed.length === 0) {
      return NextResponse.json({ messages: [] })
    }
    const scopeFilter = allowed === null
      ? ''
      : `(${allowed.map(e => `to:${e} OR from:${e}`).join(' OR ')})`

    const combinedQ = [q, deptFilter, scopeFilter].filter(Boolean).join(' ')

    const gmail = await getGmailClient()
    // folder=ALL ג†’ search all mail (no label filter), used for beneficiary threads
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
