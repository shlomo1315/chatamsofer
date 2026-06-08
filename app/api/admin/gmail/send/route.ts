import { NextResponse, type NextRequest } from 'next/server'
import { getGmailClient } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

function encodeHeader(text: string): string {
  // RFC 2047 encoded-word for non-ASCII header values
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`
}

export async function POST(request: NextRequest) {
  const { to, subject, body, threadId } = await request.json()

  const from     = process.env.GMAIL_EMAIL ?? 'office@chasamsofer.info'
  const fromName = 'היכל החתם סופר משרד ראשי'
  const htmlBody = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/></head><body style="direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;">${body ?? ''}</body></html>`
  const bodyB64  = Buffer.from(htmlBody, 'utf8').toString('base64')

  const raw = [
    `From: ${encodeHeader(fromName)} <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64,
  ].join('\r\n')

  const encoded = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  try {
    const gmail = await getGmailClient()
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded, threadId: threadId || undefined },
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
