import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { authorizeDonorRequest } from '@/lib/donorReportGate'
import { loadCharges, MAX_RANGE_DAYS, parseDateSelection } from '@/lib/donorCharges'
import { CardFileError, DATE_SLACK_DAYS, MAX_CARD_FILE_BYTES, parseCardFile, reconcile } from '@/lib/donorCardReconcile'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// התאמה בין קובץ אשראי שהנדיב העלה לבין החיובים במערכת (ראו lib/donorCardReconcile).
// הקובץ מגיע כ-base64 בתוך JSON, נקרא בזיכרון בלבד ולא נשמר בשום מקום.
// 🔴 בתשובה רק שורות הקובץ (בית עסק עם מספרים ארוכים מוסתרים) והחיובים שהשתתפו
// בהתאמה, באותם שדות שדוח החיובים כבר חושף. ת״ז ופרטי כרטיס לא יוצאים מהשרת.
const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
const MAX_BODY = Math.ceil(MAX_CARD_FILE_BYTES * 4 / 3) + 4096
const DAY_MS = 86_400_000
const shift = (d: string, days: number) => new Date(Date.parse(d) + days * DAY_MS).toISOString().slice(0, 10)

export async function POST(request: NextRequest) {
  if (!rateLimit(`donor-reconcile:${clientIp(request)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429, headers: { ...HEADERS, 'Retry-After': '60' } })
  }
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) {
    return NextResponse.json({ error: 'הקובץ גדול מ-5MB' }, { status: 413, headers: HEADERS })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: HEADERS })

  const gate = await authorizeDonorRequest(request, db, request.nextUrl.searchParams.get('t'))
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status, headers: HEADERS })

  let name = '', data = ''
  let picked: { from: string; to: string } | null = null
  try {
    const raw = await request.text()
    if (raw.length > MAX_BODY) return NextResponse.json({ error: 'הקובץ גדול מ-5MB' }, { status: 413, headers: HEADERS })
    const body = JSON.parse(raw) as { name?: unknown; data?: unknown; from?: unknown; to?: unknown }
    name = typeof body.name === 'string' ? body.name.slice(0, 200) : ''
    data = typeof body.data === 'string' ? body.data : ''
    // הטווח שנבחר בדוח חל על ההתאמה ועל ההפרש; בלי טווח תקין, טווח הקובץ
    const sel = parseDateSelection({ from: typeof body.from === 'string' ? body.from : null, to: typeof body.to === 'string' ? body.to : null })
    picked = sel && 'from' in sel ? { from: sel.from, to: sel.to } : null
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400, headers: HEADERS })
  }
  if (!data || !/^[A-Za-z0-9+/=\s]+$/.test(data)) return NextResponse.json({ error: 'לא התקבל קובץ' }, { status: 400, headers: HEADERS })

  try {
    const bytes = Buffer.from(data, 'base64')
    const parsed = await parseCardFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, name)
    const dates = parsed.rows.map(r => r.date).sort()
    const range = picked ?? { from: dates[0], to: dates[dates.length - 1] }
    const from = shift(range.from, -DATE_SLACK_DAYS), to = shift(range.to, DATE_SLACK_DAYS)
    if ((Date.parse(to) - Date.parse(from)) / DAY_MS + 1 > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: 'הקובץ מכסה יותר משנה. העלו פירוט של חודש או כמה חודשים' }, { status: 400, headers: HEADERS })
    }
    const charges = await loadCharges(db, { from, to }, gate.lockedHome)
    const result = reconcile(parsed.rows, charges, { range })
    const shown = new Set([...result.rows.map(r => r.chargeId).filter(Boolean), ...result.missing])
    const matched = result.rows.filter(r => r.status === 'ok' || r.status === 'diff' || r.status === 'none')
    return NextResponse.json({
      columns: parsed.columns,
      rows: matched,
      range: result.range,
      missing: result.missing,
      charges: charges.filter(c => shown.has(c.id)).map(c => ({ id: c.id, date: c.date, home: c.home, name: c.name, amount: c.amount })),
      // מה שלא נכנס להתאמה, כדי שאפשר יהיה לראות למה
      other: result.rows.filter(r => r.status === 'other'),
      out: result.rows.filter(r => r.status === 'out').length,
      skipped: parsed.skipped.slice(0, 200),
      skippedCount: parsed.skipped.length,
      total: parsed.rows.length,
      foreign: parsed.foreign,
      ilsFrom: parsed.ilsFrom,
      order: parsed.order,
    }, { headers: HEADERS })
  } catch (e) {
    if (e instanceof CardFileError) return NextResponse.json({ error: e.message }, { status: 400, headers: HEADERS })
    console.error('[donor-report/charges/reconcile]', e instanceof Error ? e.message : 'error')
    return NextResponse.json({ error: 'ההתאמה נכשלה' }, { status: 500, headers: HEADERS })
  }
}
