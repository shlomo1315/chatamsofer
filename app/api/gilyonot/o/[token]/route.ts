import { getServiceClient } from '@/lib/apiAuth'

// פיקסל פתיחה של מייל הגיליון. ציבורי בכוונה; הטוקן הוא של שורת המשלוח.
// תמיד מחזיר את התמונה, גם כשהטוקן לא תקין, כדי לא לשבור את המייל.
export const dynamic = 'force-dynamic'

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_r: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const id = token.replace(/\.gif$/i, '')
  if (UUID_RE.test(id)) {
    const db = getServiceClient()
    if (db) {
      const { error } = await db.rpc('gilyonot_track', { p_token: id, p_kind: 'open' })
      if (error) console.error('[gilyonot] רישום פתיחה נכשל:', error.message)
    }
  }
  return new Response(GIF, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
  })
}
