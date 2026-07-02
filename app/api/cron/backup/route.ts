// גיבוי יומי אוטומטי → Google Drive + שמירה (retention) + מייל אישור/התראה.
// מוגן ב-CRON_SECRET. הרצה: GET עם ?token=<CRON_SECRET> או Authorization: Bearer.
import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient, verifyCronSecret } from '@/lib/apiAuth'
import { generateBackup, backupFilename } from '@/lib/backup'
import { uploadBackup, listBackups, deleteBackup, driveReady } from '@/lib/googleDrive'
import { deliverMail } from '@/lib/sendMail'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const REPORT_TO = 'office@chasamsofer.info'

// מפתח חודשי לזיהוי "התחלף חודש" — לפי שעון ישראל (כך שגיבוי חצות נספר נכון).
const ISRAEL_TZ = 'Asia/Jerusalem'
function monthKey(d: Date): string {
  // YYYY-MM לפי אזור הזמן של ישראל
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit' }).format(d)
  return parts // למשל "2026-06"
}
function dayKey(d: Date): string {
  // YYYY-MM-DD לפי אזור הזמן של ישראל — לזיהוי "כבר גובה היום"
  return new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
// רק קבצי הגיבוי שלנו (לא נוגעים בקבצים אחרים בתיקייה)
const isOurBackup = (name: string) => /^backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/.test(name)
const MIN_KEEP = 7 // רשת ביטחון — תמיד שומרים לפחות 7 האחרונים

export async function GET(request: NextRequest) {
  // נכשל-סגור: אם CRON_SECRET אינו מוגדר או לא תואם — חסום (verifyCronSecret מקבל
  // Authorization: Bearer או ?secret=). מונע גיבוי לא-מורשה גם אם המשתנה נשמט.
  const okToken = verifyCronSecret(request) || request.nextUrl.searchParams.get('token') === process.env.CRON_SECRET
  if (!process.env.CRON_SECRET || !okToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!(await driveReady())) return NextResponse.json({ error: 'Google Drive אינו מחובר' }, { status: 503 })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'no admin client' }, { status: 500 })

  const now = new Date()
  const today = dayKey(now)
  const force = request.nextUrl.searchParams.get('force') === '1'

  // אידמפוטנטי: גיבוי אחד ליום בלבד. כך אפשר לקרוא לכתובת בתדירות גבוהה (גם כל שעה)
  // מכל מתזמן, והיא תגבה רק פעם ביום. ?force=1 עוקף (לבדיקה ידנית).
  if (!force) {
    const { data: ran } = await admin.from('app_settings').select('value').eq('key', 'backup_last_run_date').maybeSingle()
    if (ran?.value === today) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'כבר בוצע גיבוי היום', date: today })
    }
  }

  try {
    const { buffer, manifest } = await generateBackup(admin)
    const filename = backupFilename(now)
    const up = await uploadBackup(filename, buffer)
    if (!up.ok) throw new Error(up.error || 'העלאה ל-Drive נכשלה')

    // סימון שהיום כבר גובה (לאידמפוטנטיות — גיבוי אחד ליום)
    await admin.from('app_settings').upsert({ key: 'backup_last_run_date', value: today }, { onConflict: 'key' }).then(undefined, () => {})

    // ניקוי פעם בחודש: רק כשמתחלף החודש מאז הניקוי האחרון.
    // מוחק את כל הגיבויים מהחודשים הקודמים (משאיר רק את החודש הנוכחי),
    // ותמיד שומר לפחות MIN_KEEP האחרונים כרשת ביטחון.
    let deleted = 0, purged = false
    const curMonth = monthKey(now)
    try {
      const { data: marker } = await admin.from('app_settings').select('value').eq('key', 'backup_last_purge_month').maybeSingle()
      if (marker?.value !== curMonth) {
        const all = (await listBackups()).filter(b => isOurBackup(b.name))
        // all ממוין מהחדש לישן (orderBy createdTime desc) — שומרים את MIN_KEEP הראשונים תמיד
        const protectedIds = new Set(all.slice(0, MIN_KEEP).map(b => b.id))
        for (const b of all) {
          if (protectedIds.has(b.id)) continue
          if (monthKey(new Date(b.createdTime)) !== curMonth) { await deleteBackup(b.id); deleted++ }
        }
        await admin.from('app_settings').upsert({ key: 'backup_last_purge_month', value: curMonth }, { onConflict: 'key' })
        purged = true
      }
    } catch { /* ניקוי best-effort */ }

    const sizeMB = Math.round(buffer.length / 1048576 * 10) / 10
    // לא שולחים מייל על כל גיבוי יומי מוצלח (מיותר). שולחים מייל רק כשמתבצע
    // הניקוי החודשי (פעם בחודש) — כסיכום קצר, וכן במקרה כשל (ב-catch).
    if (purged) {
      deliverMail(REPORT_TO, `🗂️ ניקוי גיבויים חודשי בוצע — נשמר החודש האחרון`,
        `<div dir="rtl" style="font-family:Arial">הגיבוי הלילי ממשיך לרוץ כרגיל.<br/>בוצע ניקוי חודשי: נמחקו ${deleted} גיבויים מחודשים קודמים (נשמר רק החודש האחרון).<br/>גיבוי אחרון: ${filename} (${sizeMB}MB).</div>`,
        undefined, { fromEmail: REPORT_TO, replyTo: REPORT_TO, skipLog: true }).catch(() => {})
    }

    return NextResponse.json({ ok: true, filename, sizeMB, deleted, purged, manifest })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    deliverMail(REPORT_TO, '⚠️ כשל בגיבוי היומי',
      `<div dir="rtl" style="font-family:Arial">הגיבוי היומי נכשל: ${msg}</div>`,
      undefined, { fromEmail: REPORT_TO, replyTo: REPORT_TO, skipLog: true }).catch(() => {})
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
