// גיבוי ידני: הורדת ZIP למחשב (GET), העלאה ל-Drive (POST), רשימת גיבויים (GET ?list=1).
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { generateBackup, backupFilename } from '@/lib/backup'
import { uploadBackup, listBackups, driveConfigured } from '@/lib/googleDrive'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  if (request.nextUrl.searchParams.get('list') === '1') {
    return NextResponse.json({ driveConfigured: driveConfigured(), backups: await listBackups() }, { headers: { 'Cache-Control': 'no-store' } })
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
  if (!driveConfigured()) return NextResponse.json({ error: 'Google Drive אינו מוגדר (GOOGLE_DRIVE_SA_KEY / GOOGLE_DRIVE_BACKUP_FOLDER_ID).' }, { status: 503 })
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { buffer, manifest } = await generateBackup(admin)
  const filename = backupFilename(new Date())
  const up = await uploadBackup(filename, buffer)
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: 502 })
  return NextResponse.json({ ok: true, filename, id: up.id, sizeMB: Math.round(buffer.length / 1048576 * 10) / 10, manifest })
}
