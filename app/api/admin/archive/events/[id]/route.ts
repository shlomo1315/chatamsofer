import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { hebrewFromIso, isEventType, UUID_RE } from '@/lib/archive'
import { deleteBackup } from '@/lib/googleDrive'
import { deleteThumb } from '@/lib/archiveThumbs'

export const dynamic = 'force-dynamic'

const COLS = 'id,name,event_date,hebrew_date,hebrew_year,event_type,place,description,photo_count,video_count,cover_file_ids,drive_folder_id'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('archive', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const b = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim().slice(0, 150)
  if (typeof b.event_date === 'string') {
    const heb = hebrewFromIso(b.event_date)
    if (!heb) return NextResponse.json({ error: 'תאריך לא תקין' }, { status: 400 })
    Object.assign(patch, { event_date: b.event_date, hebrew_date: heb.date, hebrew_year: heb.year })
  }
  if (isEventType(b.event_type)) patch.event_type = b.event_type
  if (typeof b.place === 'string') patch.place = b.place.trim().slice(0, 150) || null
  if (typeof b.description === 'string') patch.description = b.description.trim().slice(0, 2000) || null
  const { data, error } = await db.from('archive_events').update(patch).eq('id', id).select(COLS).single()
  if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  return NextResponse.json({ event: data })
}

export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('archive', 'delete')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const { data: files } = await db.from('archive_files').select('id,drive_file_id').eq('event_id', id).limit(5000)
  for (const f of files ?? []) {
    await deleteBackup(f.drive_file_id as string).catch(() => {})
    await deleteThumb(f.id as string).catch(() => {})
  }
  const { error } = await db.from('archive_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'המחיקה נכשלה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
