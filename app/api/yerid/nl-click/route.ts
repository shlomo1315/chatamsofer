import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'

// לחיצה על "לצפייה בהזמנה" בדיוור ההודעה למזמינים: מסמן ומעביר להזמנה.
//
// 🔴 לחיצה היא גם הוכחת פתיחה — הפיקסל נחסם לעיתים קרובות (NetFree,
// תמונות כבויות), ובלעדי זה מי שנכנס להזמנה היה מופיע כ"לא פתח".
//
// ⚠️ היעד נבנה כאן מהטוקן בלבד (/yerid/order/<token>), ולכן אין כאן
// הפניה פתוחה לכתובת חיצונית.

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN = /^[A-Za-z0-9_-]{8,512}$/

export async function GET(request: NextRequest) {
  const r = request.nextUrl.searchParams.get('r') ?? ''
  const o = request.nextUrl.searchParams.get('o') ?? ''
  // 🔴 לא request.nextUrl.origin: מאחורי Railway הוא localhost:8080.
  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')

  if (!TOKEN.test(o)) return NextResponse.redirect(`${base}/yerid/my-order`)

  if (UUID.test(r)) {
    const db = getServiceClient()
    if (db) {
      try {
        const { data } = await db.from('book_fair_newsletter_recipients')
          .select('opened_at, clicked_at').eq('id', r).maybeSingle()
        if (data) {
          const now = new Date().toISOString()
          await db.from('book_fair_newsletter_recipients')
            .update({ opened_at: data.opened_at ?? now, clicked_at: data.clicked_at ?? now })
            .eq('id', r)
        }
      } catch (e) {
        console.error('[yerid/nl-click]', e)
      }
    }
  }
  return NextResponse.redirect(`${base}/yerid/order/${encodeURIComponent(o)}`)
}
