import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireAdmin, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { loadAuthorPayouts } from '@/lib/bookFairAuthorRatesLoad'

// ייצוא הסכומים למחברים לאקסל. מנהל בלבד.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** מונע הזרקת נוסחאות באקסל. */
const safe = (v: unknown) => {
  const s = String(v ?? '')
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}
const shekels = (agorot: number) => agorot / 100

export async function GET() {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { payouts: p, error } = await loadAuthorPayouts(db)
  if (error) return NextResponse.json({ error: 'הייצוא נכשל' }, { status: 422 })

  const wb = new ExcelJS.Workbook()
  const sheet = (name: string, headers: string[], widths: number[]) => {
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true }] })
    ws.columns = headers.map((header, i) => ({ header, width: widths[i] }))
    ws.getRow(1).font = { bold: true }
    return ws
  }

  const sum = sheet('סיכום', ['מחבר / מכון / מו"ל', 'עותקים', 'סכום לתשלום'], [34, 10, 16])
  for (const x of p.parties) sum.addRow([safe(x.party), x.qty, shekels(x.amountAgorot)])
  sum.addRow(['סך הכל', p.totalQty, shekels(p.totalAgorot)]).font = { bold: true }

  const det = sheet('פירוט ספרים', ['מחבר / מכון / מו"ל', 'ספר', 'נמכר', 'מחיר לעותק', 'סכום'], [34, 40, 8, 12, 14])
  for (const x of p.parties) for (const b of x.books) det.addRow([safe(x.party), safe(b.title), b.qty, shekels(b.priceAgorot), shekels(b.amountAgorot)])

  const rest = sheet('חריגים', ['סוג', 'ספר', 'פרטים'], [30, 40, 34])
  for (const u of p.unmatched) rest.addRow(['לא הותאם, ממתין לאישור', safe(u.title), safe(`${u.party} · ${u.reason}`)])
  for (const u of p.unpriced) rest.addRow(['נמכר ואין מחיר בקובץ', safe(u.title), `${u.qty} עותקים`])
  for (const u of p.unpaid) rest.addRow(['ללא מחבר / מו"ל, לא משולם', safe(u.title), `${u.qty} עותקים`])
  for (const s of p.skipped) rest.addRow(['שורה בלי מחיר, דולגה', safe(s.title), safe(s.party)])

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('סכומים למחברים.xlsx')}`,
      'Cache-Control': 'no-store',
    },
  })
}
