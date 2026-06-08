import { NextResponse, type NextRequest } from 'next/server'
import { getGmailClient } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const messageId    = searchParams.get('messageId')
  const attachmentId = searchParams.get('attachmentId')
  const filename     = searchParams.get('filename') ?? 'attachment'
  const mimeType     = searchParams.get('mimeType') ?? 'application/octet-stream'

  if (!messageId || !attachmentId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }

  try {
    const gmail = await getGmailClient()
    const res = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    })

    const data = res.data.data
    if (!data) return NextResponse.json({ error: 'empty attachment' }, { status: 404 })

    const buffer = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    return new Response(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
