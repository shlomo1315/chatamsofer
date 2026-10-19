import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireAdmin, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { formatShekels, creditStatusLabel, safeCell as safe } from '@/lib/bookFairCredits'
import { logActivity } from '@/lib/activityLog'

// ייצוא כל הזיכויים עם פרטי החשבון שהוזנו. מנהל בלבד, והייצוא נרשם ביומן (בלי הפרטים עצמם).

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const date = (v: string | null) => (v ? new Date(v).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '')

export async function GET() {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { data, error } = await db.from('book_fair_credits')
    .select('customer_name, phone, email, channel, books, amount_agorot, status, details_at, transferred_at, bank_holder, bank_holder_id, bank_holder_recording, bank_number, bank_branch, bank_account, created_at')
    .order('created_at')
  if (error) return NextResponse.json({ error: 'הייצוא נכשל' }, { status: 422 })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('פרטי חשבון', { views: [{ rightToLeft: true }] })
  ws.columns = [
    { header: 'שם לקוח', width: 20 }, { header: 'טלפון', width: 14 }, { header: 'מייל', width: 26 },
    { header: 'ספרים', width: 34 }, { header: 'סכום זיכוי', width: 12 }, { header: 'סטטוס', width: 14 },
    { header: 'הועבר בבנק', width: 11 }, { header: 'תאריך העברה', width: 18 },
    { header: 'שם בעל החשבון', width: 22 }, { header: 'מספר זהות', width: 12 }, { header: 'הקלטת שם (טלפון)', width: 30 },
    { header: 'בנק', width: 8 }, { header: 'סניף', width: 8 }, { header: 'חשבון', width: 14 }, { header: 'פרטים התקבלו', width: 18 },
  ]
  // שומר על אפסים מובילים בטלפון, בת"ז ובמספרי הבנק
  for (const c of [2, 10, 12, 13, 14]) ws.getColumn(c).numFmt = '@'
  ws.getRow(1).font = { bold: true }
  for (const r of data ?? []) {
    ws.addRow([
      safe(r.customer_name), safe(r.phone), safe(r.email), safe(r.books), Number(formatShekels(r.amount_agorot)),
      creditStatusLabel(r.status, null), r.transferred_at ? 'כן' : 'לא', date(r.transferred_at),
      safe(r.bank_holder), safe(r.bank_holder_id), safe(r.bank_holder_recording),
      safe(r.bank_number), safe(r.bank_branch), safe(r.bank_account), date(r.details_at),
    ])
  }
  await logActivity(db, { userId: staff.userId, action: 'book_fair_credits_export', entityType: 'book_fair_credits', details: { rows: data?.length ?? 0 } })

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('פרטי חשבון לזיכוי.xlsx')}`,
      'Cache-Control': 'no-store',
    },
  })
}
