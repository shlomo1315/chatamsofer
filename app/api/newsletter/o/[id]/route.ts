import { getServiceClient } from '@/lib/apiAuth'
import { recordNewsletterEvent } from '@/lib/newsletter/trackEvent'

// פיקסל פתיחה של מייל ניוזלטר. ציבורי בכוונה; המזהה הוא של שורת הנמען (uuid).
// תמיד מחזיר את התמונה, גם כשהמזהה לא תקין או שהרישום נכשל, כדי לא לשבור את המייל.
export const dynamic = 'force-dynamic'

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const gif = () => new Response(GIF, {
  headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
})

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id.replace(/\.gif$/i, '')
  const db = UUID_RE.test(id) ? getServiceClient() : null
  if (db) {
    try {
      await recordNewsletterEvent(db, { recipientId: id, kind: 'open', ua: request.headers.get('user-agent'), method: request.method, source: 'own' })
    } catch (e) { console.error('[newsletter] רישום פתיחה נכשל:', e) }
  }
  return gif()
}

// סורקים שולחים HEAD. מחזירים תמונה בלי לרשום.
export async function HEAD() { return gif() }
