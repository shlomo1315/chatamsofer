import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { hebrewFromIso, isEventType } from '@/lib/archive'
import { createDriveFolder, ensureArchiveRootFolder, driveReady } from '@/lib/googleDrive'
import { safeFileName } from '@/lib/archive'

export const dynamic = 'force-dynamic'

const COLS = 'id,name,event_date,hebrew_date,hebrew_year,event_type,place,description,photo_count,video_count,cover_file_ids,drive_folder_id'

export async function GET() {
  const staff = await requirePermission('archive', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { data, error } = await db.from('archive_events').select(COLS).order('event_date', { ascending: false }).limit(2000)
  if (error) return NextResponse.json({ error: 'טעינת האירועים נכשלה' }, { status: 500 })
  return NextResponse.json({ events: data ?? [] })
}

export async function POST(request: Request) {
  const staff = await requirePermission('archive', 'add')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const b = await request.json().catch(() => null) as Record<string, unknown> | null
  const name = typeof b?.name === 'string' ? b.name.trim().slice(0, 150) : ''
  const date = typeof b?.event_date === 'string' ? b.event_date : ''
  const heb = hebrewFromIso(date)
  if (!name) return NextResponse.json({ error: 'חסר שם אירוע' }, { status: 400 })
  if (!heb) return NextResponse.json({ error: 'תאריך לא תקין' }, { status: 400 })
  const type = isEventType(b?.event_type) ? b.event_type : 'אחר'
  const place = typeof b?.place === 'string' ? b.place.trim().slice(0, 150) || null : null
  const description = typeof b?.description === 'string' ? b.description.trim().slice(0, 2000) || null : null

  if (!(await driveReady())) return NextResponse.json({ error: 'Google Drive אינו מחובר' }, { status: 503 })
  let folderId: string
  try {
    const root = await ensureArchiveRootFolder()
    folderId = await createDriveFolder(safeFileName(`${date} ${name}`), root)
  } catch {
    return NextResponse.json({ error: 'יצירת התיקייה ב-Drive נכשלה' }, { status: 502 })
  }
  const { data, error } = await db.from('archive_events').insert({
    name, event_date: date, hebrew_date: heb.date, hebrew_year: heb.year,
    event_type: type, place, description, drive_folder_id: folderId, created_by: staff.userId,
  }).select(COLS).single()
  if (error) return NextResponse.json({ error: 'שמירת האירוע נכשלה' }, { status: 500 })
  return NextResponse.json({ event: data })
}
