import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { UUID_RE } from '@/lib/archive'
import { deleteBackup } from '@/lib/googleDrive'
import { deleteThumb } from '@/lib/archiveThumbs'
import { recomputeEvent } from '@/lib/archiveServer'

export const dynamic = 'force-dynamic'

export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('archive', 'delete')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const { data: f } = await db.from('archive_files').select('event_id,drive_file_id').eq('id', id).maybeSingle()
  if (!f) return NextResponse.json({ error: 'הקובץ לא נמצא' }, { status: 404 })
  await deleteBackup(f.drive_file_id as string)
  await deleteThumb(id)
  await db.from('archive_files').delete().eq('id', id)
  await recomputeEvent(db, f.event_id as string)
  return NextResponse.json({ ok: true })
}
