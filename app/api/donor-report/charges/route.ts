import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { authorizeDonorRequest } from '@/lib/donorReportGate'
import { chargesFileName, chargesSheets, groupCharges, loadCharges, parseDateSelection, selectionDays, selectionLabel } from '@/lib/donorCharges'
import { buildXlsx, xlsxHeaders } from '@/lib/xlsx'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// דוח חיובים לנדיב לפי תאריכים (ראו lib/donorCharges). אותו שער גישה כמו דוח היולדות.
// ?format=xlsx מחזיר קובץ אקסל במקום JSON. ?month=YYYY-MM מחזיר רק את הימים
// שיש בהם חיובים, לנקודות בלוח השנה.
const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

export async function GET(request: NextRequest) {
  if (!rateLimit(`donor-charges:${clientIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429, headers: { ...HEADERS, 'Retry-After': '60' } })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: HEADERS })

  const sp = request.nextUrl.searchParams
  const gate = await authorizeDonorRequest(request, db, sp.get('t'))
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status, headers: HEADERS })

  const month = sp.get('month')
  if (month !== null) {
    const m = /^(\d{4})-(\d{2})$/.exec(month)
    if (!m || +m[2] < 1 || +m[2] > 12) return NextResponse.json({ error: 'חודש לא תקין' }, { status: 400, headers: HEADERS })
    const last = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate()
    try {
      const charges = await loadCharges(db, { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }, gate.lockedHome)
      return NextResponse.json({ days: [...new Set(charges.map(c => c.date))].sort() }, { headers: HEADERS })
    } catch (e) {
      console.error('[donor-report/charges month]', e)
      return NextResponse.json({ error: 'שליפת החיובים נכשלה' }, { status: 500, headers: HEADERS })
    }
  }

  const sel = parseDateSelection({ dates: sp.get('dates'), from: sp.get('from'), to: sp.get('to') })
  if (!sel) return NextResponse.json({ error: 'בחרו תאריך או טווח תאריכים תקין (עד שנה)' }, { status: 400, headers: HEADERS })

  let report
  try { report = groupCharges(await loadCharges(db, sel, gate.lockedHome)) } catch (e) {
    console.error('[donor-report/charges]', e)
    return NextResponse.json({ error: 'שליפת החיובים נכשלה' }, { status: 500, headers: HEADERS })
  }

  const days = selectionDays(sel)
  if (sp.get('format') === 'xlsx') {
    const buf = await buildXlsx(chargesSheets(report, days))
    return new NextResponse(new Uint8Array(buf), { headers: { ...xlsxHeaders(chargesFileName(sel)), 'X-Robots-Tag': 'noindex' } })
  }

  return NextResponse.json({ label: gate.link.label, lockedHome: gate.lockedHome, selection: selectionLabel(sel), days, ...report }, { headers: HEADERS })
}
