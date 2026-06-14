import { NextResponse, type NextRequest } from 'next/server'
import { getGmailClient } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const { searchParams } = request.nextUrl
  const messageId    = searchParams.get('messageId')
  const attachmentId = searchParams.get('attachmentId')
  const filename     = searchParams.get('filename') ?? 'attachment'
  const mimeType     = searchParams.get('mimeType') ?? 'application/octet-stream'

  if (!messageId || !attachmentId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }

  // inlineData: small attachment already embedded in the message (no extra API call needed)
  const inlineData = searchParams.get('inlineData')
  if (inlineData) {
    const buffer = Buffer.from(inlineData.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    return new Response(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': String(buffer.length),
      },
    })
  }

  if (!attachmentId) return NextResponse.json({ error: 'missing attachmentId' }, { status: 400 })

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
