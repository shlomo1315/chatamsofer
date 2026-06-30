// גיבוי ידני: הורדת ZIP למחשב (GET), העלאה ל-Drive (POST), רשימת גיבויים (GET ?list=1).
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { generateBackup, backupFilename } from '@/lib/backup'
import { restoreBackup } from '@/lib/restore'
import { uploadBackup, listBackups, driveReady } from '@/lib/googleDrive'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  if (request.nextUrl.searchParams.get('list') === '1') {
    return NextResponse.json({ driveConfigured: await driveReady(), backups: await listBackups() }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const { buffer } = await generateBackup(admin)
  const filename = backupFilename(new Date())
  return new NextResponse(new Uint8Array(buffer), {
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

  const { buffer, manifest } = await generateBackup(admin)
  const filename = backupFilename(new Date())
  const up = await uploadBackup(filename, buffer)
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: 502 })
  return NextResponse.json({ ok: true, filename, id: up.id, sizeMB: Math.round(buffer.length / 1048576 * 10) / 10, manifest })
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
