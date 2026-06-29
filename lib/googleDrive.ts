// העלאת גיבויים ל-Google Drive דרך חיבור ה-OAuth הקיים של Google (אותו אחד של Gmail),
// עם הרשאת Drive. כך אין צורך במפתח Service Account (שחסום במדיניות הארגון).
// דורש: חיבור Google מחדש (עם scope של drive) + GOOGLE_DRIVE_BACKUP_FOLDER_ID.
import { google } from 'googleapis'
import { Readable } from 'stream'
import { getOAuthClient } from './gmail'
import { getServiceClient } from './apiAuth'

// מוגדר ברמת ההגדרות אם תיקיית היעד הוגדרה (החיבור עצמו נבדק בזמן אמת).
export function driveConfigured(): boolean {
  return !!process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
}

async function driveClient() {
  if (!process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID) return null
  const admin = getServiceClient()
  if (!admin) return null
  const { data } = await admin.from('app_settings').select('value').eq('key', 'gmail_refresh_token').maybeSingle()
  if (!data?.value) return null
  const oauth = getOAuthClient()
  oauth.setCredentials({ refresh_token: data.value })
  return google.drive({ version: 'v3', auth: oauth })
}

// האם הגיבוי ל-Drive מוכן בפועל (תיקייה + חיבור Google עם הרשאה)
export async function driveReady(): Promise<boolean> {
  return !!(await driveClient())
}

export async function uploadBackup(
  filename: string, data: Buffer, mimeType = 'application/zip',
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const drive = await driveClient()
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
  if (!drive || !folderId) return { ok: false, error: 'Google Drive אינו מחובר' }
  try {
    const res = await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType, body: Readable.from(data) },
      fields: 'id',
      supportsAllDrives: true,
    })
    return { ok: true, id: res.data.id ?? undefined }
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
