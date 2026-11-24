import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { authorizeDonorRequest } from '@/lib/donorReportGate'
import { loadApprovedRows, effectiveFilter, filterRows, summarize, digitsQuery } from '@/lib/donorReport'

export const dynamic = 'force-dynamic'

// נקודת קצה ציבורית לקריאה בלבד: דוח יולדות לנדיב (ראו lib/donorReport).
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
  // 🔴 בלי סיסמה שהוגדרה ובלי cookie תקף של הקישור הזה — אין נתונים.
  const gate = await authorizeDonorRequest(request, db, sp.get('t'))
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status, headers: HEADERS })
  const { link, lockedHome } = gate

  let all
  try { all = await loadApprovedRows(db) } catch (e) {
    console.error('[donor-report]', e)
    return NextResponse.json({ error: 'שליפת הנתונים נכשלה' }, { status: 500, headers: HEADERS })
  }

  // 🔴 רשימת הבתים והשורות מוגבלות לבית הנעול *לפני* כל סינון של הלקוח.
  const scope = lockedHome ? all.filter(r => r.home === lockedHome) : all
  const filter = effectiveFilter(link, { from: sp.get('from'), to: sp.get('to'), home: sp.get('home') })
  const rows = filterRows(scope, filter)

  const digits = digitsQuery(sp.get('q') ?? '')
  const idMatches = digits ? rows.filter(r => r.idNumber.includes(digits)).map(r => r.id) : []

  void db.from('donor_report_links').update({ last_used_at: new Date().toISOString() }).eq('id', link.id)

  return NextResponse.json({
    label: link.label,
    lockedHome,
    homes: [...new Set(scope.map(r => r.home))].sort((a, b) => a.localeCompare(b, 'he')),
    summary: summarize(rows),
    // 🔴 הת.ז. המלאה לא יוצאת: רק מזהי השורות שמתאימות לחיפוש (ארבע ספרות לפחות).
    idMatches,
    rows: rows.map(({ id, name, home, date, amount, note, city, community, kind, nights, eligibleNights, arrived, idLast4 }) =>
      ({ id, name, home, date, amount, note, city, community, kind, nights, eligibleNights, arrived, idLast4 })),
  }, { headers: HEADERS })
}
