import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { DASH_CONFIG_KEY, DASH_COOKIE, parseDashConfig, dashTokenValid } from '@/lib/bookFairDashboard'
import { loadFoodCardRows, summarizeFoodCards } from '@/lib/maternityFoodCards'

// סיכום כרטיסי המזון של מחלקת היולדות, לאותו לוח ניהול (אותה כניסה בסיסמה).
// 🔴 מספרים מסוכמים בלבד, בלי פרטי יולדות. בלי קריאה לנדרים.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה בשרת' }, { status: 500 })

  const { data: row } = await db.from('app_settings').select('value').eq('key', DASH_CONFIG_KEY).maybeSingle()
  const cfg = parseDashConfig(row?.value ?? null)
  if (!dashTokenValid(request.cookies.get(DASH_COOKIE)?.value, cfg)) {
    return NextResponse.json({ error: 'נדרשת כניסה' }, { status: 401 })
  }
  if (!rateLimit(`fair-dash-cards:${clientIp(request)}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  try {
    const summary = summarizeFoodCards(await loadFoodCardRows(db))
    return NextResponse.json(
      { ...summary, at: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    )
  } catch (e) {
    console.error('[fair/dash] food cards failed:', e)
    return NextResponse.json({ error: 'הטעינה נכשלה' }, { status: 500 })
  }
}
