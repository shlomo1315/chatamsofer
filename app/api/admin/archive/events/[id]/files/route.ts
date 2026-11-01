import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { detectKind, safeFileName, UUID_RE } from '@/lib/archive'
import { uploadFileStreamToFolder } from '@/lib/googleDrive'
import { recomputeEvent } from '@/lib/archiveServer'

// העלאת קובץ בודד כזרם ישיר ל-Drive (בלי להחזיק אותו בזיכרון). הדפדפן שולח קובץ אחד בכל בקשה.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const COLS = 'id,event_id,name,kind,mime,size_bytes,width,height,duration_sec,has_thumb,drive_file_id'
const num = (v: string | null) => { const n = Number(v); return v && Number.isFinite(n) && n > 0 ? Math.round(n) : null }

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('archive', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const { data, error } = await db.from('archive_files').select(COLS).eq('event_id', id)
    .order('created_at', { ascending: true }).limit(5000)
  if (error) return NextResponse.json({ error: 'טעינת הקבצים נכשלה' }, { status: 500 })
  return NextResponse.json({ files: data ?? [] })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('archive', 'add')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const { data: ev } = await db.from('archive_events').select('id,drive_folder_id').eq('id', id).maybeSingle()
  if (!ev?.drive_folder_id) return NextResponse.json({ error: 'האירוע לא נמצא' }, { status: 404 })

  const q = request.nextUrl.searchParams
  const name = safeFileName(q.get('name') ?? '')
  const mime = request.headers.get('content-type')?.split(';')[0] || q.get('mime') || 'application/octet-stream'
  const kind = detectKind(name, mime)
  if (!kind) return NextResponse.json({ error: 'סוג קובץ לא נתמך (תמונה או סרטון בלבד)' }, { status: 415 })
  if (!request.body) return NextResponse.json({ error: 'גוף הבקשה ריק' }, { status: 400 })

  const up = await uploadFileStreamToFolder(
    name, request.body as unknown as AsyncIterable<Uint8Array>, mime, ev.drive_folder_id as string,
  )
  if (!up.ok || !up.id) return NextResponse.json({ error: up.error || 'ההעלאה ל-Drive נכשלה' }, { status: 502 })
  const { data, error } = await db.from('archive_files').insert({
    event_id: id, name, kind, mime, size_bytes: up.bytes, drive_file_id: up.id,
    width: num(q.get('w')), height: num(q.get('h')), duration_sec: num(q.get('dur')),
  }).select(COLS).single()
  if (error) return NextResponse.json({ error: 'שמירת הקובץ נכשלה' }, { status: 500 })
  return NextResponse.json({ file: data })
}

// סיום העלאה: מחשב מחדש ספירות וקאברים של האירוע.
export async function PUT(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('archive', 'add')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  await recomputeEvent(db, id)
  const { data } = await db.from('archive_events')
    .select('id,name,event_date,hebrew_date,hebrew_year,event_type,place,description,photo_count,video_count,cover_file_ids,drive_folder_id')
    .eq('id', id).single()
  return NextResponse.json({ event: data })
}
