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

// מפתח האסימון של חשבון הגיבוי. נפרד מ-gmail_refresh_token בכוונה — ראו למטה.
export const DRIVE_TOKEN_KEY = 'drive_backup_refresh_token'
/** הכתובת של חשבון הגיבוי, נשמרת לתצוגה בהגדרות. */
export const DRIVE_ACCOUNT_KEY = 'drive_backup_account_email'

/**
 * לקוח OAuth לגיבוי (או null אם Drive אינו מחובר/מוגדר).
 *
 * ⚠️ חשבון הגיבוי יכול להיות נפרד מחשבון הדואר. עד כה הגיבוי השתמש תמיד
 * ב-gmail_refresh_token, כלומר הקבצים עלו ל-Drive של חשבון הדואר — בלי שום
 * דרך לבחור אחר, ובלי שיהיה כתוב בשום מקום לאיזה חשבון הם הולכים.
 *
 * ⚠️ נפילה חזרה לחשבון הדואר במכוון: התקנה קיימת שלא חיברה חשבון גיבוי נפרד
 * חייבת להמשיך לגבות בדיוק כמו קודם. בלי הנפילה הזו, הפריסה הייתה מכבה את
 * הגיבוי בשקט — התקלה הגרועה ביותר האפשרית כאן.
 */
async function driveAuth() {
  if (!process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID) return null
  const admin = getServiceClient()
  if (!admin) return null
  const { data } = await admin.from('app_settings').select('key, value')
    .in('key', [DRIVE_TOKEN_KEY, 'gmail_refresh_token'])
  const byKey = new Map((data ?? []).map(r => [r.key as string, r.value as string]))
  const token = byKey.get(DRIVE_TOKEN_KEY) || byKey.get('gmail_refresh_token')
  if (!token) return null
  const oauth = getOAuthClient()
  oauth.setCredentials({ refresh_token: token })
  return oauth
}

/** מי מחובר לגיבוי בפועל, ומאיזה מקור. לתצוגה בהגדרות. */
export async function driveAccountInfo(): Promise<{
  connected: boolean; email: string | null; dedicated: boolean; folderConfigured: boolean
}> {
  const folderConfigured = !!process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
  const admin = getServiceClient()
  if (!admin) return { connected: false, email: null, dedicated: false, folderConfigured }
  const { data } = await admin.from('app_settings').select('key, value')
    .in('key', [DRIVE_TOKEN_KEY, DRIVE_ACCOUNT_KEY, 'gmail_refresh_token', 'gmail_account_email'])
  const byKey = new Map((data ?? []).map(r => [r.key as string, r.value as string]))
  const dedicated = !!byKey.get(DRIVE_TOKEN_KEY)
  return {
    connected: !!(byKey.get(DRIVE_TOKEN_KEY) || byKey.get('gmail_refresh_token')),
    email: dedicated
      ? (byKey.get(DRIVE_ACCOUNT_KEY) ?? null)
      : (byKey.get('gmail_account_email') ?? process.env.GMAIL_EMAIL ?? null),
    dedicated,
    folderConfigured,
  }
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
// ⚠️ size=null כשהגודל אינו ידוע מראש (העלאה מזרם) — אז לא שולחים
// X-Upload-Content-Length כלל, וגוגל לומדת את הגודל מהמנה האחרונה.
async function openUploadSession(
  token: string, filename: string, folderId: string, mimeType: string, size: number | null,
): Promise<string> {
  const res = await fetch(`${UPLOAD_ROOT}?uploadType=resumable&supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      ...(size == null ? {} : { 'X-Upload-Content-Length': String(size) }),
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
// ⚠️ total=null (גודל לא ידוע) → "bytes */*".
async function committedOffset(sessionUrl: string, total: number | null): Promise<number> {
  const res = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${total ?? '*'}` },
  })
  if (res.status === 200 || res.status === 201) return -1
  if (res.status !== 308) throw new Error(`בירור מצב ההעלאה נכשל (${res.status})`)
  // Range נראה כך: "bytes=0-8388607". היעדרו פירושו ששום בייט לא נקלט עדיין.
  const range = res.headers.get('range')
  const last = range ? Number(range.split('-')[1]) : NaN
  return Number.isFinite(last) ? last + 1 : 0
}

type ChunkOutcome = { done: false } | { done: true; id?: string }

// שולח מנה אחת, עם ניסיונות חוזרים על כשלי רשת/5xx.
// ⚠️ המנה מוחזקת בזיכרון של הקורא, ולכן ניסיון חוזר אפשרי גם בהעלאה מזרם:
// שואלים את גוגל כמה נקלט ושולחים רק את היתרה, בלי לחזור למקור הנתונים
// (שאינו ניתן להרצה מחדש).
async function putChunk(
  sessionUrl: string, chunk: Buffer, offset: number, total: number | null, retryWaitMs: number,
): Promise<ChunkOutcome> {
  let tries = 0
  let start = offset
  for (;;) {
    const rel = start - offset
    const end = offset + chunk.length - 1
    const isFinalizer = chunk.length === 0
    try {
      const body = isFinalizer ? undefined : new Uint8Array(
        chunk.buffer as ArrayBuffer, chunk.byteOffset + rel, chunk.length - rel,
      )
      const range = isFinalizer
        // סגירת העלאה שנגמרה בדיוק על גבול מנה — בלי גוף, רק הצהרת הגודל.
        ? `bytes */${total}`
        : `bytes ${start}-${end}/${total ?? '*'}`
      const res = await fetch(sessionUrl, { method: 'PUT', headers: { 'Content-Range': range }, body })

      if (res.status === 200 || res.status === 201) {
        const parsed = await res.json().catch(() => ({})) as { id?: string }
        return { done: true, id: parsed?.id }
      }
      if (res.status === 308) return { done: false }

      const text = (await res.text()).slice(0, 300)
      if (res.status < 500) throw new Error(`ההעלאה נדחתה (${res.status}): ${text}`)
      throw new Error(`שגיאת שרת בגוגל (${res.status}): ${text}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const retryable = RETRYABLE.test(msg) || /שגיאת שרת בגוגל/.test(msg)
      if (!retryable || ++tries >= MAX_TRIES) throw e
      await sleep(tries * retryWaitMs)
      const at = await committedOffset(sessionUrl, total).catch(() => start)
      if (at === -1) return { done: true }
      if (at >= offset + chunk.length) return { done: false } // המנה כן נקלטה במלואה
      start = Math.max(at, offset)
      console.warn(`[googleDrive] ניסיון ${tries} — ממשיך מהיסט ${start} (${msg})`)
    }
  }
}

/**
 * מעלה גיבוי ישירות מזרם — בלי להחזיק את הקובץ כולו בזיכרון.
 *
 * 🔴 זו הדרך שבה הגיבוי היומי עובד. הדרך הקודמת בנתה Buffer של 3.7GB
 * (ובזיכרון בפועל ~16GB) בתוך התהליך שמגיש את האתר, כך שחריגה הייתה מפילה
 * את האתר ולא רק את הגיבוי.
 *
 * ⚠️ הגודל אינו ידוע מראש, ולכן המנות נשלחות עם "/*" ורק המנה האחרונה
 * מצהירה על הגודל האמיתי. אם הזרם נגמר בדיוק על גבול מנה — נשלחת בקשת
 * סגירה בלי גוף ("bytes *&#47;total"), אחרת גוגל תמתין להמשך שלא יגיע.
 *
 * ⚠️ שיא הזיכרון כאן הוא מנה אחת (8MB) ולא גודל הגיבוי — וזה כל העניין.
 * מיוצא לצורך בדיקות (retryWaitMs=0 כדי לא להמתין באמת).
 */
export async function uploadStreamToSession(
  sessionUrl: string, source: AsyncIterable<Buffer | Uint8Array>, retryWaitMs = 2500,
): Promise<{ ok: boolean; id?: string; bytes: number; error?: string }> {
  let offset = 0
  let pending: Buffer[] = []
  let pendingLen = 0

  const flush = async (total: number | null): Promise<ChunkOutcome> => {
    const buf = pendingLen ? Buffer.concat(pending, pendingLen) : Buffer.alloc(0)
    const take = total == null ? CHUNK_BYTES : buf.length
    const chunk = buf.subarray(0, take)
    const rest = buf.subarray(take)
    pending = rest.length ? [rest] : []
    pendingLen = rest.length
    const out = await putChunk(sessionUrl, chunk, offset, total, retryWaitMs)
    offset += chunk.length
    return out
  }

  try {
    for await (const piece of source) {
      pending.push(Buffer.isBuffer(piece) ? piece : Buffer.from(piece))
      pendingLen += piece.length
      // ⚠️ מנות ביניים חייבות להיות כפולה של 256KiB, ולכן שולחים בדיוק
      // CHUNK_BYTES ומשאירים את העודף לסבב הבא.
      while (pendingLen >= CHUNK_BYTES) {
        const out = await flush(null)
        if (out.done) return { ok: true, id: out.id, bytes: offset }
      }
    }
    // המנה האחרונה — כאן הגודל הכולל נודע. גם אם היא ריקה (הזרם נגמר על
    // גבול מנה) חייבים לשלוח אותה, כהצהרת סיום.
    const total = offset + pendingLen
    if (total === 0) return { ok: false, bytes: 0, error: 'הגיבוי יצא ריק — לא הועלה' }
    const out = await flush(total)
    if (out.done) return { ok: true, id: out.id, bytes: offset }
    return { ok: false, bytes: offset, error: 'ההעלאה הסתיימה בלי אישור מגוגל' }
  } catch (e) {
    return { ok: false, bytes: offset, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function uploadBackupStream(
  filename: string, source: AsyncIterable<Buffer | Uint8Array>, mimeType = 'application/zip',
): Promise<{ ok: boolean; id?: string; sizeMB?: number; error?: string }> {
  const oauth = await driveAuth()
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
  if (!oauth || !folderId) return { ok: false, error: 'Google Drive אינו מחובר' }

  try {
    const { token } = await oauth.getAccessToken()
    if (!token) return { ok: false, error: 'קבלת אסימון גישה מגוגל נכשלה' }

    const sessionUrl = await openUploadSession(token, filename, folderId, mimeType, null)
    const res = await uploadStreamToSession(sessionUrl, source)
    const sizeMB = Math.round(res.bytes / 1048576 * 10) / 10
    if (res.ok) console.log(`[googleDrive] הגיבוי הועלה · ${filename} · ${sizeMB}MB`)
    return { ok: res.ok, id: res.id, sizeMB, error: res.error }
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
