// העלאת גיבויים ל-Google Drive דרך חיבור ה-OAuth הקיים של Google (אותו אחד של Gmail),
// עם הרשאת Drive. כך אין צורך במפתח Service Account (שחסום במדיניות הארגון).
// דורש: חיבור Google מחדש (עם scope של drive) + GOOGLE_DRIVE_BACKUP_FOLDER_ID.
import { google } from 'googleapis'
import { getOAuthClient } from './gmail'
import { getServiceClient } from './apiAuth'

// מוגדר ברמת ההגדרות אם תיקיית היעד הוגדרה (החיבור עצמו נבדק בזמן אמת).
export function driveConfigured(): boolean {
  return !!process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
}

// לקוח OAuth מוכן לשימוש (או null אם Drive אינו מחובר/מוגדר).
async function driveAuth() {
  if (!process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID) return null
  const admin = getServiceClient()
  if (!admin) return null
  const { data } = await admin.from('app_settings').select('value').eq('key', 'gmail_refresh_token').maybeSingle()
  if (!data?.value) return null
  const oauth = getOAuthClient()
  oauth.setCredentials({ refresh_token: data.value })
  return oauth
}

async function driveClient() {
  const oauth = await driveAuth()
  return oauth ? google.drive({ version: 'v3', auth: oauth }) : null
}

// האם הגיבוי ל-Drive מוכן בפועל (תיקייה + חיבור Google עם הרשאה)
export async function driveReady(): Promise<boolean> {
  return !!(await driveClient())
}

// ⚠️ העלאה מסוג resumable, ולא multipart — זו הסיבה שהגיבוי היומי לא עבד.
//
// הרקע: `files.create` עם media שולח `uploadType=multipart`, וההעלאה נכשלה
// בכל פעם ב-`write EPROTO`. זו לא הייתה תקלת רשת אקראית (הניסיונות החוזרים
// שנוספו לא עזרו — כל שלושת הניסיונות נכשלו, כל שעה, יממה שלמה): multipart
// מוגבל ל-5MB, וגיבוי מלא הוא מאות MB. גוגל מנתקת את החיבור באמצע הכתיבה
// של הגוף, ו-Node מדווח על כך כשגיאת TLS במקום כתשובת HTTP.
//
// resumable הוא הפרוטוקול המיועד לקבצים גדולים: פותחים סשן, ומעלים במנות.
// יתרון נוסף — מנה שנכשלת נשלחת מחדש לבדה במקום להתחיל את כל הקובץ מאפס.
const UPLOAD_ROOT = 'https://www.googleapis.com/upload/drive/v3/files'
// ⚠️ חייב להיות כפולה של 256KiB (דרישת גוגל), פרט למנה האחרונה.
const CHUNK_BYTES = 8 * 1024 * 1024
const RETRYABLE = /EPROTO|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|socket hang up|network|timeout|fetch failed/i
const MAX_TRIES = 4

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// פותח סשן העלאה ומחזיר את כתובת הסשן (ה-Location שגוגל מחזירה).
async function openUploadSession(
  token: string, filename: string, folderId: string, mimeType: string, size: number,
): Promise<string> {
  const res = await fetch(`${UPLOAD_ROOT}?uploadType=resumable&supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(size),
    },
    body: JSON.stringify({ name: filename, parents: [folderId] }),
  })
  if (!res.ok) throw new Error(`פתיחת סשן ההעלאה נכשלה (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const location = res.headers.get('location')
  if (!location) throw new Error('גוגל לא החזירה כתובת סשן להעלאה')
  return location
}

// שואל את גוגל כמה בייטים כבר נקלטו בסשן — כדי להמשיך מהנקודה הנכונה אחרי
// כשל, במקום לשלוח שוב מנה שכבר התקבלה.
// מחזיר את ההיסט הבא לשליחה, או -1 אם ההעלאה כבר הושלמה.
async function committedOffset(sessionUrl: string, total: number): Promise<number> {
  const res = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${total}` },
  })
  if (res.status === 200 || res.status === 201) return -1
  if (res.status !== 308) throw new Error(`בירור מצב ההעלאה נכשל (${res.status})`)
  // Range נראה כך: "bytes=0-8388607". היעדרו פירושו ששום בייט לא נקלט עדיין.
  const range = res.headers.get('range')
  const last = range ? Number(range.split('-')[1]) : NaN
  return Number.isFinite(last) ? last + 1 : 0
}

// מעלה את הקובץ במנות אל סשן פתוח. מיוצא לצורך בדיקות (הסשן עצמו נפתח
// מול גוגל, וכאן מתחילה כל הלוגיקה שיכולה להישבר).
// retryWaitMs — 0 בבדיקות, כדי לא להמתין באמת בין ניסיונות.
export async function uploadToSession(
  sessionUrl: string, data: Buffer, retryWaitMs = 2500,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const total = data.length
  let offset = 0
  let tries = 0

  while (offset < total) {
    const end = Math.min(offset + CHUNK_BYTES, total)
    try {
      // ⚠️ בלי כותרת Authorization: כתובת הסשן היא בעצמה ההרשאה, וכך
      // ההעלאה אינה נשברת אם האסימון פג באמצע קובץ גדול.
      // ⚠️ בלי Content-Length ידני — undici קובע אותו מהגוף, וקביעה
      // כפולה עלולה לסתור את האורך האמיתי של המנה.
      // תצוגה (view) על אותו זיכרון ולא העתק — מנה של 8MB לא מוכפלת בזיכרון.
      // ההמרה ל-ArrayBuffer בטוחה: Buffer של Node לעולם אינו SharedArrayBuffer.
      const chunk = new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset + offset, end - offset)
      const res = await fetch(sessionUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${total}` },
        body: chunk,
      })

      if (res.status === 200 || res.status === 201) {
        const body = await res.json().catch(() => ({})) as { id?: string }
        return { ok: true, id: body?.id }
      }
      if (res.status === 308) { offset = end; tries = 0; continue }

      // 5xx — צד גוגל, שווה ניסיון חוזר. כל השאר (הרשאה/מכסה) סופי.
      const text = (await res.text()).slice(0, 300)
      if (res.status < 500) return { ok: false, error: `ההעלאה נדחתה (${res.status}): ${text}` }
      throw new Error(`שגיאת שרת בגוגל (${res.status}): ${text}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!RETRYABLE.test(msg) && !/שגיאת שרת בגוגל/.test(msg)) return { ok: false, error: msg }
      if (++tries >= MAX_TRIES) return { ok: false, error: `המנה שמהיסט ${offset} נכשלה ${MAX_TRIES} פעמים: ${msg}` }
      await sleep(tries * retryWaitMs)
      // מסתנכרנים מול גוגל לפני הניסיון החוזר — ייתכן שהמנה כן נקלטה
      // ורק התשובה אבדה, ושליחה חוזרת שלה הייתה שוברת את הרצף.
      const at = await committedOffset(sessionUrl, total).catch(() => offset)
      if (at === -1) return { ok: true }
      offset = at
      console.warn(`[googleDrive] ניסיון ${tries} — ממשיך מהיסט ${offset}/${total} (${msg})`)
    }
  }
  return { ok: false, error: 'ההעלאה הסתיימה בלי אישור מגוגל' }
}

export async function uploadBackup(
  filename: string, data: Buffer, mimeType = 'application/zip',
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const oauth = await driveAuth()
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
  if (!oauth || !folderId) return { ok: false, error: 'Google Drive אינו מחובר' }
  if (data.length === 0) return { ok: false, error: 'קובץ הגיבוי ריק — לא הועלה' }

  try {
    const { token } = await oauth.getAccessToken()
    if (!token) return { ok: false, error: 'קבלת אסימון גישה מגוגל נכשלה' }

    const sessionUrl = await openUploadSession(token, filename, folderId, mimeType, data.length)
    const res = await uploadToSession(sessionUrl, data)
    if (res.ok) console.log(`[googleDrive] הגיבוי הועלה · ${filename} · ${Math.round(data.length / 1048576)}MB`)
    return res
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

type DriveFile = { id: string; name: string; createdTime: string; size: number }

export async function listBackups(): Promise<DriveFile[]> {
  const drive = await driveClient()
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
  if (!drive || !folderId) return []
  const out: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, createdTime, size)',
      orderBy: 'createdTime desc',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    for (const f of res.data.files ?? []) {
      out.push({ id: f.id!, name: f.name ?? '', createdTime: f.createdTime ?? '', size: Number(f.size ?? 0) })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

export async function deleteBackup(fileId: string): Promise<void> {
  const drive = await driveClient()
  if (!drive) return
  try { await drive.files.delete({ fileId, supportsAllDrives: true }) } catch { /* best-effort */ }
}
