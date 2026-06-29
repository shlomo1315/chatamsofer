// גיבוי יומי אוטומטי → Google Drive + שמירה (retention) + מייל אישור/התראה.
// מוגן ב-CRON_SECRET. הרצה: GET עם ?token=<CRON_SECRET> או Authorization: Bearer.
import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { generateBackup, backupFilename } from '@/lib/backup'
import { uploadBackup, listBackups, deleteBackup, driveConfigured } from '@/lib/googleDrive'
import { deliverMail } from '@/lib/sendMail'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const REPORT_TO = 'office@chasamsofer.info'

// קובע אילו גיבויים לשמור: כל היומיים מ-30 הימים האחרונים + שבועי (12) + חודשי (12).
function idsToKeep(backups: { id: string; createdTime: string }[]): Set<string> {
  const keep = new Set<string>()
  const now = Date.now()
  const DAY = 86400000
  const wk = (t: number) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return `${Math.floor((t - day * DAY) / (7 * DAY))}` }
  const mk = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}-${d.getUTCMonth()}` }
  const weeks = new Map<string, string>(), months = new Map<string, string>()
  for (const b of backups) { // backups ממוינים מהחדש לישן
    const t = new Date(b.createdTime).getTime()
    if (now - t <= 30 * DAY) keep.add(b.id)
    const w = wk(t); if (!weeks.has(w)) weeks.set(w, b.id)
    const m = mk(t); if (!months.has(m)) months.set(m, b.id)
  }
  ;[...weeks.values()].slice(0, 12).forEach(id => keep.add(id))
  ;[...months.values()].slice(0, 12).forEach(id => keep.add(id))
  return keep
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const token = request.nextUrl.searchParams.get('token')
  if (secret && auth !== `Bearer ${secret}` && token !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!driveConfigured()) return NextResponse.json({ error: 'Google Drive אינו מוגדר' }, { status: 503 })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'no admin client' }, { status: 500 })

  try {
    const { buffer, manifest } = await generateBackup(admin)
    const filename = backupFilename(new Date())
    const up = await uploadBackup(filename, buffer)
    if (!up.ok) throw new Error(up.error || 'העלאה ל-Drive נכשלה')

    // שמירה: מחיקת גיבויים מעבר למדיניות
    let deleted = 0
    try {
      const all = await listBackups()
      const keep = idsToKeep(all)
      for (const b of all) if (!keep.has(b.id)) { await deleteBackup(b.id); deleted++ }
    } catch { /* ניקוי best-effort */ }

    const sizeMB = Math.round(buffer.length / 1048576 * 10) / 10
    deliverMail(REPORT_TO, `✅ גיבוי יומי הושלם — ${filename}`,
      `<div dir="rtl" style="font-family:Arial">גיבוי יומי הועלה ל-Google Drive בהצלחה.<br/>קובץ: ${filename}<br/>גודל: ${sizeMB}MB<br/>קבצים: ${manifest.storageFiles ?? '?'}<br/>נמחקו ${deleted} גיבויים ישנים (שמירה).</div>`,
      undefined, { fromEmail: REPORT_TO, replyTo: REPORT_TO, skipLog: true }).catch(() => {})

    return NextResponse.json({ ok: true, filename, sizeMB, deleted, manifest })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    deliverMail(REPORT_TO, '⚠️ כשל בגיבוי היומי',
      `<div dir="rtl" style="font-family:Arial">הגיבוי היומי נכשל: ${msg}</div>`,
      undefined, { fromEmail: REPORT_TO, replyTo: REPORT_TO, skipLog: true }).catch(() => {})
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
