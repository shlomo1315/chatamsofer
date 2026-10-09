import { NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'

// פיקסל פתיחה לדיוור ההודעה למזמינים.
//
// ⚠️ ציבורי ובלי חתימה: המזהה הוא uuid של שורת נמען, שאינו ניתן לניחוש,
// והנזק המרבי מזיוף הוא סימון "נפתח" שגוי.
// ⚠️ תמיד מחזיר את התמונה — גם בשגיאה. תמונה שבורה במייל נראית כתקלה.

export const dynamic = 'force-dynamic'

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const r = request.nextUrl.searchParams.get('r') ?? ''
  if (UUID.test(r)) {
    const db = getServiceClient()
    if (db) {
      try {
        const { data } = await db.from('book_fair_newsletter_recipients')
          .select('opened_at, open_count').eq('id', r).maybeSingle()
        if (data) {
          await db.from('book_fair_newsletter_recipients')
            .update({
              opened_at: data.opened_at ?? new Date().toISOString(),
              open_count: (data.open_count ?? 0) + 1,
            })
            .eq('id', r)
        }
      } catch (e) {
        console.error('[yerid/nl-open]', e)
      }
    }
  }
  return new Response(GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  })
}
