import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { loadApprovedRows, resolveDonorLink, effectiveFilter, filterRows, summarize } from '@/lib/donorReport'

export const dynamic = 'force-dynamic'

// נקודת קצה ציבורית לקריאה בלבד: מעקב אשראי לנדיב (ראו lib/donorReport).
// הגישה רק עם טוקן תקף שלא בוטל; הטוקן מגביל גם את בית ההחלמה.
const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

export async function GET(request: NextRequest) {
  // מגבלה גם לפי IP — בלימת ניחושי טוקנים.
  if (!rateLimit(`donor-report:${clientIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429, headers: { ...HEADERS, 'Retry-After': '60' } })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: HEADERS })

  const sp = request.nextUrl.searchParams
  const link = await resolveDonorLink(db, sp.get('t'))
  if (!link) return NextResponse.json({ error: 'הקישור אינו תקין או שבוטל' }, { status: 404, headers: HEADERS })

  let all
  try { all = await loadApprovedRows(db) } catch (e) {
    console.error('[donor-report]', e)
    return NextResponse.json({ error: 'שליפת הנתונים נכשלה' }, { status: 500, headers: HEADERS })
  }

  // 🔴 רשימת הבתים והשורות מוגבלות לבית הנעול *לפני* כל סינון של הלקוח.
  const lockedHome = (link.recovery_home ?? '').trim() || null
  const scope = lockedHome ? all.filter(r => r.home === lockedHome) : all
  const filter = effectiveFilter(link, { from: sp.get('from'), to: sp.get('to'), home: sp.get('home') })
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
