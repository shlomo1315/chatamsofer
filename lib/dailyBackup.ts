// גיבוי יומי — worker פנימי (in-process), עמיד. רץ מתוך instrumentation.ts,
// בלי תלות בשירות curl חיצוני (שנשבר בשקט ולא גיבה 6 ימים).
//
// אידמפוטנטי: גיבוי אחד ליום (app_settings.backup_last_run_date). כל קריאה
// לפני חצות שכבר גובתה — מדולגת. כולל התראת מייל אם עבר יום בלי גיבוי מוצלח.
import { getServiceClient } from '@/lib/apiAuth'
import { createBackupArchive, backupFilename } from '@/lib/backupArchive'
import { uploadBackupStream, listBackups, deleteBackup, driveReady } from '@/lib/googleDrive'
import { deliverMail } from '@/lib/sendMail'

const REPORT_TO = 'office@chasamsofer.info'
const ISRAEL_TZ = 'Asia/Jerusalem'
const MIN_KEEP = 7

function monthKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit' }).format(d)
}
function dayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
const isOurBackup = (name: string) => /^backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/.test(name)

export interface BackupResult {
  ok: boolean
  skipped?: boolean
  filename?: string
  sizeMB?: number
  error?: string
}

// בדיקה זולה: האם הגיבוי של היום כבר בוצע (שורה יחידה מ-app_settings).
// משמש את ה-scheduler ל-catch-up — לרוץ גם מחוץ לחלון חצות אם דילגנו על היום
// (למשל deploy שנפל בדיוק על חצות). זול מספיק להרצה כל שעה.
export async function backupDoneToday(): Promise<boolean> {
  const admin = getServiceClient()
  if (!admin) return true // בלי admin ממילא לא נגבה — לא לגרום לניסיונות חוזרים
  const { data } = await admin.from('app_settings').select('value').eq('key', 'backup_last_run_date').maybeSingle()
  return data?.value === dayKey(new Date())
}

// מבצע גיבוי אם עוד לא בוצע היום. best-effort — לא זורק.
export async function runDailyBackup(force = false): Promise<BackupResult> {
  const admin = getServiceClient()
  if (!admin) return { ok: false, error: 'no admin client' }
  if (!(await driveReady())) {
    // Drive לא מחובר — לא ניתן לגבות. מתריעים (פעם ביום) כדי שלא יעבור בשקט.
    await alertOnce(admin, 'drive_not_ready', 'הגיבוי היומי לא רץ — Google Drive אינו מחובר. יש לחבר מחדש בהגדרות.')
    return { ok: false, error: 'Google Drive אינו מחובר' }
  }

  const now = new Date()
  const today = dayKey(now)

  if (!force) {
    const { data: ran } = await admin.from('app_settings').select('value').eq('key', 'backup_last_run_date').maybeSingle()
    if (ran?.value === today) return { ok: true, skipped: true }
  }

  try {
    // ⚠️ הגיבוי נבנה ונשלח כזרם, ולא נאסף ל-Buffer. שיא הזיכרון הוא מנה אחת
    // (8MB) ולא גודל הגיבוי — ראו lib/backupArchive.
    const filename = backupFilename(now)
    const { stream, done } = createBackupArchive(admin)
    // ⚠️ תופסים את הדחייה מיד: אם הבנייה נכשלת באמצע, ההעלאה תיפול ממילא על
    // הזרם, ובלי catch כאן זו הייתה unhandled rejection שמפילה את התהליך.
    let buildError: unknown = null
    const built = done.catch((e: unknown) => { buildError = e; return null })
    const up = await uploadBackupStream(filename, stream)
    await built
    if (buildError) throw buildError
    if (!up.ok) throw new Error(up.error || 'העלאה ל-Drive נכשלה')

    await admin.from('app_settings').upsert({ key: 'backup_last_run_date', value: today }, { onConflict: 'key' }).then(undefined, () => {})

    // ניקוי חודשי — כמו ב-cron/backup: מוחק גיבויים מחודשים קודמים, שומר לפחות MIN_KEEP.
    const curMonth = monthKey(now)
    try {
      const { data: marker } = await admin.from('app_settings').select('value').eq('key', 'backup_last_purge_month').maybeSingle()
      if (marker?.value !== curMonth) {
        const all = (await listBackups()).filter(b => isOurBackup(b.name))
        const protectedIds = new Set(all.slice(0, MIN_KEEP).map(b => b.id))
        for (const b of all) {
          if (protectedIds.has(b.id)) continue
          if (monthKey(new Date(b.createdTime)) !== curMonth) { await deleteBackup(b.id) }
        }
        await admin.from('app_settings').upsert({ key: 'backup_last_purge_month', value: curMonth }, { onConflict: 'key' })
      }
    } catch { /* ניקוי best-effort */ }

    return { ok: true, filename, sizeMB: up.sizeMB }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    deliverMail(REPORT_TO, 'כשל בגיבוי היומי',
      `<div dir="rtl" style="font-family:'Heebo',Arial,sans-serif">הגיבוי היומי (worker פנימי) נכשל: ${msg}</div>`,
      undefined, { fromEmail: REPORT_TO, replyTo: REPORT_TO, skipLog: true }).catch(() => {})
    return { ok: false, error: msg }
  }
}

// התראת מייל שנשלחת לכל היותר פעם ביום לכל מפתח התראה (מונע הצפה).
async function alertOnce(admin: NonNullable<ReturnType<typeof getServiceClient>>, key: string, message: string) {
  const today = dayKey(new Date())
  const settingKey = `backup_alert_${key}`
  const { data } = await admin.from('app_settings').select('value').eq('key', settingKey).maybeSingle()
  if (data?.value === today) return
  await admin.from('app_settings').upsert({ key: settingKey, value: today }, { onConflict: 'key' }).then(undefined, () => {})
  deliverMail(REPORT_TO, 'התראת גיבוי — היכל החתם סופר',
    `<div dir="rtl" style="font-family:'Heebo',Arial,sans-serif">${message}</div>`,
    undefined, { fromEmail: REPORT_TO, replyTo: REPORT_TO, skipLog: true }).catch(() => {})
}

// בדיקת "שומר סף" — אם עבר יותר מיום מאז הגיבוי המוצלח האחרון, מתריע.
// נקראת מדי יום; מזהה מצב שבו הגיבוי לא רץ (למשל Drive מנותק) כדי שלא יעבור בשקט.
export async function checkBackupFreshness(): Promise<void> {
  const admin = getServiceClient()
  if (!admin) return
  const { data } = await admin.from('app_settings').select('value').eq('key', 'backup_last_run_date').maybeSingle()
  const last = data?.value ?? null
  const today = dayKey(new Date())
  // הגיבוי היומי אמור לרוץ בחצות ולעדכן ל-today. אם הערך אינו של היום ולא של אתמול — התראה.
  const yesterday = dayKey(new Date(Date.now() - 86400000))
  if (last !== today && last !== yesterday) {
    await alertOnce(admin, 'stale', `שים לב: לא בוצע גיבוי יומי מאז ${last ?? '(אין רשומה)'}. יש לבדוק את חיבור Google Drive בהגדרות.`)
  }
}
