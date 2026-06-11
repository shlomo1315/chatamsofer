import { type NextRequest } from 'next/server'
import { getGmailClient } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// Close connection after 55s — before Vercel's 60s serverless timeout.
// EventSource reconnects automatically on the client side.
const CONN_LIFETIME_MS = 55_000
const POLL_INTERVAL_MS = 4_000
const HEARTBEAT_INTERVAL_MS = 20_000

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const folder = request.nextUrl.searchParams.get('folder') ?? 'INBOX'
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false

      const send = (data: object) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { closed = true }
      }

      const heartbeat = (comment: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`: ${comment}\n\n`))
        } catch { closed = true }
      }

      const close = () => {
        if (closed) return
        closed = true
        clearInterval(pollTimer)
        clearInterval(hbTimer)
        clearTimeout(lifetimeTimer)
        try { controller.close() } catch {}
      }

      let knownIds = new Set<string>()
      let initialized = false

      const check = async () => {
        if (closed) return
        try {
          const gmail = await getGmailClient()
          const res = await gmail.users.messages.list({
            userId: 'me',
            labelIds: [folder],
            maxResults: 30,
          })
          const ids = new Set(
            (res.data.messages ?? []).map(m => m.id!).filter(Boolean)
          )

          if (!initialized) {
            knownIds = ids
            initialized = true
            send({ type: 'ready' })
            return
          }

          const newCount = [...ids].filter(id => !knownIds.has(id)).length
          if (newCount > 0) {
            knownIds = new Set([...ids, ...knownIds])
            send({ type: 'new', count: newCount })
          }
        } catch {
          // Gmail not connected or quota — don't crash the stream
        }
      }

      await check()

      const pollTimer    = setInterval(check, POLL_INTERVAL_MS)
      const hbTimer      = setInterval(() => heartbeat('heartbeat'), HEARTBEAT_INTERVAL_MS)
      const lifetimeTimer = setTimeout(() => {
        send({ type: 'reconnect' })
        close()
      }, CONN_LIFETIME_MS)

      request.signal.addEventListener('abort', close)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disables nginx/Vercel buffering
    },
  })
}
