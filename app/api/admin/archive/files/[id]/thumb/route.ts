import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { UUID_RE } from '@/lib/archive'
import { saveThumb, readThumb, generateThumbFromDrive } from '@/lib/archiveThumbs'

// מוקטנים מוגשים מהדומיין שלנו (דיסק השרת), כך שנטפרי לא חוסם אותם.
export const dynamic = 'force-dynamic'
const MAX_THUMB = 600_000

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('archive', 'view')
  if (!staff) return forbidden()
  const { id } = await params
  if (!UUID_RE.test(id)) return new NextResponse(null, { status: 400 })
  let buf = await readThumb(id)
  if (!buf) {
    const db = getServiceClient()
    if (!db) return serverMisconfigured()
    const { data: f } = await db.from('archive_files').select('kind,drive_file_id').eq('id', id).maybeSingle()
    if (!f) return new NextResponse(null, { status: 404 })
    if (f.kind === 'image') buf = await generateThumbFromDrive(id, f.drive_file_id as string)
  }
  if (!buf) return new NextResponse(null, { status: 404 })
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' },
  })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('archive', 'add')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const buf = Buffer.from(await request.arrayBuffer())
  if (buf.length < 100 || buf.length > MAX_THUMB) return NextResponse.json({ error: 'מוקטן לא תקין' }, { status: 400 })
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) return NextResponse.json({ error: 'המוקטן חייב להיות JPEG' }, { status: 415 })
  if (!(await saveThumb(id, buf))) return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
  await db.from('archive_files').update({ has_thumb: true }).eq('id', id)
  return NextResponse.json({ ok: true })
}
