import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { loadApprovedRows, resolveDonorLink, checkDonorPassword, effectiveFilter, filterRows, summarize } from '@/lib/donorReport'

export const dynamic = 'force-dynamic'

// נקודת קצה ציבורית לקריאה בלבד: מעקב אשראי לנדיב (ראו lib/donorReport).
// הגישה רק עם טוקן תקף שלא בוטל; הטוקן מגביל גם את בית ההחלמה.
const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

export async function POST(request: NextRequest) {
  // מגבלה גם לפי IP — בלימת ניחושי טוקנים.
  if (!rateLimit(`donor-report:${clientIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429, headers: { ...HEADERS, 'Retry-After': '60' } })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: HEADERS })

  let body: { t?: unknown; password?: unknown; from?: unknown; to?: unknown; home?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400, headers: HEADERS }) }
  const str = (v: unknown) => (typeof v === 'string' ? v : null)

  const link = await resolveDonorLink(db, body.t)
  if (!link) return NextResponse.json({ error: 'הקישור אינו תקין או שבוטל' }, { status: 404, headers: HEADERS })

  // 🔴 סיסמה לכל קישור, נבדקת בשרת. נעילה זמנית אחרי ניסיונות כושלים רצופים (נשמרת במסד).
  const check = await checkDonorPassword(link, body.password)
  if (check.status === 'no_password') {
    return NextResponse.json({ error: 'לקישור זה עדיין לא הוגדרה סיסמה. פנו למשרד.' }, { status: 403, headers: HEADERS })
  }
  if (check.status === 'locked') {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.', code: 'locked' },
      { status: 429, headers: { ...HEADERS, 'Retry-After': String(check.retryAfterSec) } })
  }
  await db.from('donor_report_links').update(check.patch).eq('id', link.id)
  if (check.status === 'wrong') {
    return NextResponse.json({ error: 'הסיסמה שגויה', code: 'wrong_password' }, { status: 401, headers: HEADERS })
  }

  let all
  try { all = await loadApprovedRows(db) } catch (e) {
    console.error('[donor-report]', e)
    return NextResponse.json({ error: 'שליפת הנתונים נכשלה' }, { status: 500, headers: HEADERS })
  }

  // 🔴 רשימת הבתים והשורות מוגבלות לבית הנעול *לפני* כל סינון של הלקוח.
  const lockedHome = (link.recovery_home ?? '').trim() || null
  const scope = lockedHome ? all.filter(r => r.home === lockedHome) : all
  const filter = effectiveFilter(link, { from: str(body.from), to: str(body.to), home: str(body.home) })
  const rows = filterRows(scope, filter)

  void db.from('donor_report_links').update({ last_used_at: new Date().toISOString() }).eq('id', link.id)

  return NextResponse.json({
    label: link.label,
    lockedHome,
    homes: [...new Set(scope.map(r => r.home))].sort((a, b) => a.localeCompare(b, 'he')),
    summary: summarize(rows),
    rows: rows.map(({ name, home, date, amount }) => ({ name, home, date, amount })),
  }, { headers: HEADERS })
}
