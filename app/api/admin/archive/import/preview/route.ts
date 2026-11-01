import { NextResponse } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { detectKind } from '@/lib/archive'
import { parseDriveFolderId } from '@/lib/driveLink'
import { DriveAccessError, listDriveFolderMedia } from '@/lib/googleDrive'

// בדיקה לפני ייבוא: האם הקישור תקין, יש גישה לתיקייה, וכמה תמונות וסרטונים יש בה.
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const staff = await requirePermission('archive', 'add')
  if (!staff) return forbidden()
  const b = await request.json().catch(() => null) as { url?: unknown } | null
  const folderId = typeof b?.url === 'string' ? parseDriveFolderId(b.url) : null
  if (!folderId) return NextResponse.json({ error: 'הקישור אינו קישור לתיקיית Drive' }, { status: 400 })
  try {
    const { name, files } = await listDriveFolderMedia(folderId, (n, m) => !!detectKind(n, m))
    const photos = files.filter(f => detectKind(f.name, f.mime) === 'image').length
    return NextResponse.json({
      name, photos, videos: files.length - photos, bytes: files.reduce((s, f) => s + (f.size ?? 0), 0),
    })
  } catch (e) {
    if (e instanceof DriveAccessError) return NextResponse.json({ error: e.message }, { status: 422 })
    return NextResponse.json({ error: 'קריאת התיקייה נכשלה' }, { status: 502 })
  }
}
