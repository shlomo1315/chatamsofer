import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { detectKind, UUID_RE } from '@/lib/archive'
import { recomputeEvent } from '@/lib/archiveServer'
import { activeJobFor, createJob, dupKey, getJob, planImport, runImport } from '@/lib/archiveImport'
import { generateThumbFromDrive } from '@/lib/archiveThumbs'
import { parseDriveFolderId } from '@/lib/driveLink'
import { DriveAccessError, copyDriveFile, listDriveFolderMedia } from '@/lib/googleDrive'

// ייבוא תיקיית Drive לאירוע: ההעתקה רצה ברקע בשרת, והמסך שואל על ההתקדמות.
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('archive', 'add')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const b = await request.json().catch(() => null) as { url?: unknown } | null
  const folderId = typeof b?.url === 'string' ? parseDriveFolderId(b.url) : null
  if (!folderId) return NextResponse.json({ error: 'הקישור אינו קישור לתיקיית Drive' }, { status: 400 })
  const { data: ev } = await db.from('archive_events').select('id,drive_folder_id').eq('id', id).maybeSingle()
  if (!ev?.drive_folder_id) return NextResponse.json({ error: 'האירוע לא נמצא' }, { status: 404 })
  const destFolder = ev.drive_folder_id as string
  if (activeJobFor(id)) return NextResponse.json({ error: 'כבר רצה שאיבה לאירוע הזה' }, { status: 409 })

  let listing
  try {
    listing = await listDriveFolderMedia(folderId, (n, m) => !!detectKind(n, m))
  } catch (e) {
    if (e instanceof DriveAccessError) return NextResponse.json({ error: e.message }, { status: 422 })
    return NextResponse.json({ error: 'קריאת התיקייה נכשלה' }, { status: 502 })
  }
  const { data: have } = await db.from('archive_files').select('name,size_bytes').eq('event_id', id).limit(20000)
  const { todo, skipped } = planImport(
    listing.files, new Set((have ?? []).map(r => dupKey(r.name as string, r.size_bytes as number | null))),
  )
  const job = createJob(id, todo.length)
  job.skipped = skipped
  if (!todo.length) { job.state = 'done'; return NextResponse.json({ job }) }

  // לא מחכים להשלמה: התשובה חוזרת מיד, וההעתקה ממשיכה בתהליך השרת.
  void runImport(job, todo, {
    copy: f => copyDriveFile(f.id, f.name, destFolder),
    save: async (f, kind, driveId) => {
      const { data, error } = await db.from('archive_files').insert({
        event_id: id, name: f.name, kind, mime: f.mime, size_bytes: f.size, drive_file_id: driveId,
        width: f.width, height: f.height, duration_sec: f.durationSec,
      }).select('id').single()
      if (error || !data) throw new Error('שמירת הקובץ נכשלה')
      return data.id as string
    },
    thumb: async (recordId, driveId, kind) => {
      if (kind !== 'image') return
      if (await generateThumbFromDrive(recordId, driveId)) await db.from('archive_files').update({ has_thumb: true }).eq('id', recordId)
    },
    finish: () => recomputeEvent(db, id),
  })
  return NextResponse.json({ job })
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('archive', 'add')
  if (!staff) return forbidden()
  const { id } = await params
  const job = getJob(new URL(request.url).searchParams.get('job') ?? '')
  if (!job || job.eventId !== id) return NextResponse.json({ error: 'המשימה לא נמצאה (ייתכן שהשרת הופעל מחדש). הקבצים שכבר יובאו נשמרו.' }, { status: 404 })
  return NextResponse.json({ job })
}
