import { NextResponse, type NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { filterClaims, filterFromParams, loadAdminClaims, logAudit } from '@/lib/matchmaker/adminData'
import { reasonsText } from '@/lib/matchmaker/reasons'

export const dynamic = 'force-dynamic'

const STATUS: Record<string, string> = { pending: 'ממתין', approved: 'אושר', rejected: 'נדחה', paid: 'שולם' }
const parents = (fn: string | null, fp: string | null, mn: string | null, mp: string | null) => [fn && `אב: ${fn} ${fp ?? ''}`, mn && `אם: ${mn} ${mp ?? ''}`].filter(Boolean).join('; ')

// ייצוא לאקסל לפי הסינון הנוכחי. ת"ז מוסתרות חלקית גם בקובץ.
export async function GET(request: NextRequest) {
  const staff = await requirePermission('matchmaker_grants', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const rows = filterClaims(await loadAdminClaims(db), filterFromParams(request.nextUrl.searchParams))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('מלגות שדכנים', { views: [{ rightToLeft: true }] })
  ws.columns = [
    { header: 'תאריך הגשה', key: 'created', width: 14 }, { header: 'תאריך שידוך', key: 'match', width: 14 },
    { header: 'שדכן', key: 'mm', width: 20 }, { header: 'טלפון שדכן', key: 'mmp', width: 14 },
    { header: 'חתן', key: 'g', width: 20 }, { header: 'ת"ז חתן', key: 'gid', width: 13 },
    { header: 'כלה', key: 'b', width: 20 }, { header: 'ת"ז כלה', key: 'bid', width: 13 },
    { header: 'נכד החתם סופר', key: 'gc', width: 14 }, { header: 'אימות', key: 'ver', width: 12 },
    { header: 'כתובת חתן', key: 'ga', width: 24 }, { header: 'חוג חתן', key: 'gcirc', width: 14 }, { header: 'הורי חתן', key: 'gp', width: 30 },
    { header: 'כתובת כלה', key: 'ba', width: 24 }, { header: 'חוג כלה', key: 'bcirc', width: 14 }, { header: 'הורי כלה', key: 'bp', width: 30 },
    { header: 'שדכן נוסף', key: 'm2', width: 20 }, { header: 'סיבות', key: 'rs', width: 30 },
    { header: 'סטטוס', key: 'st', width: 10 }, { header: 'סכום', key: 'amt', width: 10 }, { header: 'סיבת דחייה', key: 'rej', width: 24 },
  ]
  ws.getRow(1).font = { bold: true }
  for (const c of rows) {
    ws.addRow({
      created: c.created_at.slice(0, 10), match: c.match_date, mm: c.matchmaker.name, mmp: c.matchmaker.phone,
      g: c.groom_name, gid: c.groom_id_masked, b: c.bride_name, bid: c.bride_id_masked,
      gc: c.is_grandchild ? 'כן' : 'לא', ver: !c.is_grandchild ? '' : c.verification?.result === 'verified' ? 'אומת' : 'לא נמצא',
      ga: c.groom_address ?? '', gcirc: c.groom_circle ?? '', gp: parents(c.groom_father_name, c.groom_phone, c.groom_mother_name, c.groom_mother_phone),
      ba: c.bride_address ?? '', bcirc: c.bride_circle ?? '', bp: parents(c.bride_father_name, c.bride_phone, c.bride_mother_name, c.bride_mother_phone),
      m2: c.second_matchmaker ? `${c.second_matchmaker.first_name} ${c.second_matchmaker.last_name} ${c.second_matchmaker.phone}` : '', rs: reasonsText(c.reasons),
      st: STATUS[c.status], amt: c.amount ?? '', rej: c.reject_reason ?? '',
    })
  }
  await logAudit(db, null, 'export', `${rows.length} שורות`, staff.email ?? staff.userId)
  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as ArrayBuffer, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="matchmaker-grants.xlsx"', 'Cache-Control': 'no-store',
  } })
}
