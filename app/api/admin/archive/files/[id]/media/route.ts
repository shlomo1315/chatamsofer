import { NextResponse, type NextRequest } from 'next/server'
import { Readable } from 'stream'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { UUID_RE, safeFileName } from '@/lib/archive'
import { openDriveFileStream } from '@/lib/googleDrive'

// הגשת המקור (תמונה מלאה / הורדה) דרך השרת שלנו, כדי שהדפדפן לא יפנה ל-Google (נטפרי חוסם).
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('archive', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { id } = await params
  if (!UUID_RE.test(id)) return new NextResponse(null, { status: 400 })
  const { data: f } = await db.from('archive_files').select('name,mime,drive_file_id').eq('id', id).maybeSingle()
  if (!f) return new NextResponse(null, { status: 404 })
  const stream = await openDriveFileStream(f.drive_file_id as string).catch(() => null)
  if (!stream) return NextResponse.json({ error: 'הקובץ לא זמין ב-Drive' }, { status: 502 })
  const download = request.nextUrl.searchParams.get('download') === '1'
  const headers: Record<string, string> = {
    'Content-Type': (f.mime as string) || 'application/octet-stream',
    'Cache-Control': 'private, max-age=86400',
  }
  if (download) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName(f.name as string))}`
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, { headers })
}
