import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'
import { uploadMailImage } from '@/lib/mailImageUpload'

// העלאת תמונה לניוזלטר. הפרטים (ולמה התמונה ציבורית) ב-lib/mailImageUpload.ts.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  return uploadMailImage(db, request, request.nextUrl.origin, 'newsletter/upload')
}
