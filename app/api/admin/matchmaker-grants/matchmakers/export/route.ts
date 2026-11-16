import { NextResponse, type NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { loadAdminClaims, loadAdminMatchmakers, logAudit } from '@/lib/matchmaker/adminData'
import { filterMatchmakers, matchmakerFilterFromParams, matchmakerSortFromParams, sortMatchmakers, summarizeMatchmakers } from '@/lib/matchmaker/matchmakerList'

export const dynamic = 'force-dynamic'

// ייצוא רשימת השדכנים לאקסל לפי הסינון והמיון הנוכחיים. חשבון הבנק מוסווה גם בקובץ.
export async function GET(request: NextRequest) {
  const staff = await requirePermission('matchmaker_grants', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const claims = await loadAdminClaims(db)
  const p = request.nextUrl.searchParams
  const rows = sortMatchmakers(filterMatchmakers(summarizeMatchmakers(await loadAdminMatchmakers(db, claims), claims), matchmakerFilterFromParams(p)), matchmakerSortFromParams(p))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('שדכנים', { views: [{ rightToLeft: true }] })
  ws.columns = [
    { header: 'שדכן', key: 'name', width: 22 }, { header: 'טלפון', key: 'phone', width: 14 }, { header: 'מייל', key: 'email', width: 26 },
    { header: 'חוג', key: 'circle', width: 16 }, { header: 'בקשות', key: 'reqs', width: 9 }, { header: 'אושרו', key: 'ok', width: 9 },
    { header: 'ממתינות', key: 'wait', width: 9 }, { header: 'שולם', key: 'paid', width: 10 }, { header: 'הגבלה פרטנית', key: 'lim', width: 13 },
    { header: 'אימות', key: 'ver', width: 18 }, { header: 'בנק', key: 'bank', width: 24 }, { header: 'נרשם', key: 'reg', width: 12 },
  ]
  ws.getRow(1).font = { bold: true }
  for (const m of rows) {
    ws.addRow({
      name: m.name, phone: m.phone, email: m.email, circle: m.circle ?? '', reqs: m.reqs, ok: m.ok, wait: m.wait, paid: m.paid,
      lim: m.claims_limit ?? '', ver: m.verified ? 'אומת' : 'ממתין לאימות אנושי',
      bank: m.bank_name ? `${m.bank_name} · סניף ${m.bank_branch ?? ''} · ${m.bank_account_masked ?? ''}` : '', reg: m.created_at.slice(0, 10),
    })
  }
  await logAudit(db, null, 'export', `שדכנים: ${rows.length} שורות`, staff.email ?? staff.userId)
  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as ArrayBuffer, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="matchmakers.xlsx"', 'Cache-Control': 'no-store',
  } })
}
