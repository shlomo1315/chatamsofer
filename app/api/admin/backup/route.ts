// גיבוי ידני: הורדת ZIP למחשב (GET), העלאה ל-Drive (POST), רשימת גיבויים (GET ?list=1).
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { createBackupArchive, backupFilename } from '@/lib/backupArchive'
import { restoreBackup } from '@/lib/restore'
import { uploadBackupStream, listBackups, driveReady } from '@/lib/googleDrive'
import { Readable } from 'stream'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  if (request.nextUrl.searchParams.get('list') === '1') {
    return NextResponse.json({ driveConfigured: await driveReady(), backups: await listBackups() }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const filename = backupFilename(new Date())
  // ⚠️ מוזרם ישירות לתגובה ולא נאסף ל-Buffer: גיבוי של כמה ג'יגה בזיכרון
  // השרת מסכן את כל התהליך, ולא רק את ההורדה הזו.
  const { stream, done } = createBackupArchive(admin)
  done.catch(e => console.error('[backup] בניית הגיבוי להורדה נכשלה:', e))
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

// העלאת גיבוי ל-Drive עכשיו (ידני)
export async function POST() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  if (!(await driveReady())) return NextResponse.json({ error: 'Google Drive אינו מחובר — חברו מחדש את חשבון Google (עם הרשאת Drive) והגדירו GOOGLE_DRIVE_BACKUP_FOLDER_ID.' }, { status: 503 })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const filename = backupFilename(new Date())
  const { stream, done } = createBackupArchive(admin)
  let buildError: unknown = null
  const built = done.catch((e: unknown) => { buildError = e; return null })
  const up = await uploadBackupStream(filename, stream)
  const manifest = await built
  if (buildError) {
    return NextResponse.json({ error: buildError instanceof Error ? buildError.message : String(buildError) }, { status: 500 })
  }
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: 502 })
  return NextResponse.json({ ok: true, filename, id: up.id, sizeMB: up.sizeMB, manifest })
}

// שחזור: העלאת קובץ ZIP של גיבוי מלא והטענתו חזרה למערכת (DB + קבצים).
export async function PUT(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 })
  const restoreFiles = form.get('restoreFiles') !== '0'

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await restoreBackup(admin, buffer, { restoreFiles })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result, { status: result.ok ? 200 : 207 })
}
