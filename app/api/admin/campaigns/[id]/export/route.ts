import { NextResponse, type NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { loadCampaignReport } from '@/lib/newsletter/reportData'

// ייצוא דוח הקמפיין לאקסל: סיכום, נמענים, קישורים, שעות ומכשירים.
export const dynamic = 'force-dynamic'

const STATUS: Record<string, string> = { sent: 'נשלח', pending: 'ממתין', failed: 'נכשל' }
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '')

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()
  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const loaded = await loadCampaignReport(db, id)
  if (!loaded) return NextResponse.json({ error: 'הקמפיין לא נמצא' }, { status: 404 })
  const { campaign, report } = loaded
  const m = report.metrics

  const wb = new ExcelJS.Workbook()
  const sheet = (name: string, columns: Partial<ExcelJS.Column>[]) => {
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] })
    ws.columns = columns
    ws.getRow(1).font = { bold: true }
    return ws
  }

  const sum = sheet('סיכום', [{ header: 'מדד', key: 'k', width: 30 }, { header: 'מספר', key: 'v', width: 14 }, { header: 'אחוז', key: 'p', width: 12 }])
  const p = (x: number) => `${x}%`
  for (const [k, v, pc] of [
    ['קמפיין', campaign.name, ''], ['תחילת שליחה', fmt(campaign.started_at), ''],
    ['נמענים', m.total, ''], ['נשלחו', m.sent, ''], ['נמסרו', m.delivered, p(m.deliveryRate)], ['נכשלו', m.failed, ''],
    ['פתחו (ייחודיים)', m.opened, p(m.openRate)], ['פתיחות (סך הכול)', m.openTotal, ''],
    ['הקליקו (ייחודיים)', m.clicked, p(m.clickRate)], ['קליקים (סך הכול)', m.clickTotal, ''],
    ['הקליקו מתוך הפותחים', '', p(m.clickToOpen)],
    ['חזרו (bounce)', m.bounced, ''], ['סימנו כספאם', m.complained, ''], ['הסירו את עצמם', m.unsubscribed, ''],
    ['פתיחות אוטומטיות (Apple, סורקים)', m.machineOpens, ''], ['קליקים של סורקים', m.machineClicks, ''],
  ] as [string, string | number, string][]) sum.addRow({ k, v, p: pc })

  const rec = sheet('נמענים', [
    { header: 'שם', key: 'name', width: 22 }, { header: 'מייל', key: 'email', width: 30 }, { header: 'סטטוס', key: 'st', width: 9 },
    { header: 'נשלח', key: 'sent', width: 18 }, { header: 'פתיחה ראשונה', key: 'fo', width: 18 }, { header: 'פתיחה אחרונה', key: 'lo', width: 18 },
    { header: 'פתיחות', key: 'oc', width: 8 }, { header: 'קליק ראשון', key: 'fc', width: 18 }, { header: 'קליקים', key: 'cc', width: 8 },
    { header: 'קישורים שנלחצו', key: 'links', width: 50 }, { header: 'מכשיר', key: 'dev', width: 9 }, { header: 'תוכנת מייל', key: 'cl', width: 12 },
    { header: 'מערכת הפעלה', key: 'os', width: 11 }, { header: 'חזר', key: 'b', width: 6 }, { header: 'ספאם', key: 'c', width: 6 },
    { header: 'הסיר', key: 'u', width: 6 }, { header: 'שגיאה', key: 'err', width: 30 },
  ])
  for (const r of report.recipients) rec.addRow({
    name: r.name, email: r.email, st: STATUS[r.status] ?? r.status, sent: fmt(r.sentAt), fo: fmt(r.firstOpen), lo: fmt(r.lastOpen),
    oc: r.openCount, fc: fmt(r.firstClick), cc: r.clickCount, links: r.links.join('\n'), dev: r.device ?? '', cl: r.client ?? '', os: r.os ?? '',
    b: r.bounced ? 'כן' : '', c: r.complained ? 'כן' : '', u: r.unsubscribed ? 'כן' : '', err: r.error ?? '',
  })

  const links = sheet('קישורים', [
    { header: 'קישור', key: 'url', width: 60 }, { header: 'נמענים שהקליקו', key: 'u', width: 15 },
    { header: 'קליקים (סך הכול)', key: 't', width: 15 }, { header: 'אחוז מהנשלחים', key: 'p', width: 14 }, { header: 'קליקים של סורקים', key: 'm', width: 15 },
  ])
  for (const l of report.links) links.addRow({ url: l.url, u: l.unique, t: l.total, p: p(l.pctOfSent), m: l.machine })

  const hours = sheet('לפי שעה', [{ header: 'שעה', key: 'h', width: 8 }, { header: 'פתחו', key: 'o', width: 10 }, { header: 'הקליקו', key: 'c', width: 10 }])
  for (const h of report.byHour) hours.addRow({ h: `${String(h.hour).padStart(2, '0')}:00`, o: h.opened, c: h.clicked })

  const dev = sheet('מכשירים', [{ header: 'סוג', key: 't', width: 16 }, { header: 'ערך', key: 'l', width: 18 }, { header: 'פותחים', key: 'n', width: 10 }])
  for (const [t, list] of [['מכשיר', report.devices], ['תוכנת מייל', report.clients], ['מערכת הפעלה', report.os]] as const)
    for (const b of list) dev.addRow({ t, l: b.label, n: b.count })

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as ArrayBuffer, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="campaign-${id.slice(0, 8)}.xlsx"`, 'Cache-Control': 'no-store',
  } })
}
