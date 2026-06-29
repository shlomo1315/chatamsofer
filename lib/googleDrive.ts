// העלאת גיבויים ל-Google Drive דרך Service Account (חשבון מערכת).
// דורש: GOOGLE_DRIVE_SA_KEY (תוכן ה-JSON של מפתח ה-Service Account) +
// GOOGLE_DRIVE_BACKUP_FOLDER_ID (מזהה תיקיית הגיבויים, ששותפה עם ה-Service Account).
import { google } from 'googleapis'
import { Readable } from 'stream'

export function driveConfigured(): boolean {
  return !!process.env.GOOGLE_DRIVE_SA_KEY && !!process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
}

function driveClient() {
  const raw = process.env.GOOGLE_DRIVE_SA_KEY
  if (!raw) return null
  let creds: { client_email?: string; private_key?: string }
  try { creds = JSON.parse(raw) } catch { return null }
  if (!creds.client_email || !creds.private_key) return null
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

// העלאת קובץ לתיקיית הגיבויים. מחזיר את מזהה הקובץ ב-Drive.
export async function uploadBackup(
  filename: string, data: Buffer, mimeType = 'application/zip',
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const drive = driveClient()
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
  if (!drive || !folderId) return { ok: false, error: 'Google Drive אינו מוגדר' }
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

// רשימת קבצי הגיבוי בתיקייה (החדשים תחילה)
export async function listBackups(): Promise<DriveFile[]> {
  const drive = driveClient()
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
  const drive = driveClient()
  if (!drive) return
  try { await drive.files.delete({ fileId, supportsAllDrives: true }) } catch { /* best-effort */ }
}
