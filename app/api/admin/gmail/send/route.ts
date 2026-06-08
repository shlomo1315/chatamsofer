import { NextResponse, type NextRequest } from 'next/server'
import { getGmailClient } from '@/lib/gmail'
import { buildRawEmail, encodeForGmail } from '@/lib/buildEmail'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const { to, subject, body, threadId } = await request.json()

  const from = process.env.GMAIL_EMAIL ?? 'office@chasamsofer.info'
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/></head><body style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;">${body ?? ''}</body></html>`

  const raw = buildRawEmail({ from, fromName: 'היכל החתם סופר', to, subject, html })
  const encoded = encodeForGmail(raw)

  try {
    const gmail = await getGmailClient()
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded, threadId: threadId || undefined },
    })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
