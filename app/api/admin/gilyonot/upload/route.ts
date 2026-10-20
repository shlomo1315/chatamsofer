import { type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden, serverMisconfigured } from '@/lib/apiAuth'
import { uploadMailImage } from '@/lib/mailImageUpload'

// העלאת תמונה לגוף מייל הגיליון, מהעורך. הפרטים ב-lib/mailImageUpload.ts.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  return uploadMailImage(db, request, request.nextUrl.origin, 'gilyonot/upload')
}
