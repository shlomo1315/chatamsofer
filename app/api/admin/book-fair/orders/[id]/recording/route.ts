import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

// ─────────────────────────────────────────────────────────────────────────────
// הקלטת הכתובת/השם של הזמנה טלפונית — להאזנה במסך ההזמנה.
//
// 🔴 הראוט הזה לא היה קיים: המסך הצביע עליו ב-<audio src> וקיבל 404,
// ונגן ריק נראה בדיוק כמו הקלטה שלא נקלטה. פקיד שלא הצליח לשמוע את
// הכתובת לא יכול היה לאשר את ההזמנה לליקוט.
//
// 🔴 הנתיב נקרא מהמסד ולא מפרמטר: קבלת שם חופשי הייתה מאפשרת
// לקרוא כל קובץ באחסון.
//
// ⚠️ ההקלטה מכילה שם וכתובת מלאה — ולכן נתיב מוגן בהרשאת צוות,
// ולא קישור ישיר לאחסון.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { id } = await params
  const recId = request.nextUrl.searchParams.get('rec')?.trim() ?? ''
  if (!recId) return NextResponse.json({ error: 'חסר מזהה הקלטה' }, { status: 400 })

  // ⚠️ מאומת שההקלטה באמת שייכת להזמנה הזו: בלי זה מזהה הקלטה של
  // הזמנה אחרת היה נגיש מכל דף הזמנה.
  const { data: rec } = await db.from('book_fair_recordings')
    .select('storage_path, order_id').eq('id', recId).maybeSingle()

  if (!rec || rec.order_id !== id) {
    return NextResponse.json({ error: 'ההקלטה לא נמצאה' }, { status: 404 })
  }

  if (rec.storage_path) {
    const { data: blob } = await db.storage.from('documents')
      .download(String(rec.storage_path))
    if (blob) {
      const buf = await blob.arrayBuffer()
      const sc = scrambleBytes(new Uint8Array(buf))
      return NextResponse.json({
        contentType: 'audio/wav',
        size: buf.byteLength,
        enc: DOC_CIPHER_ID,
        data: Buffer.from(sc).toString('base64'),
      }, { headers: { 'Cache-Control': 'no-store' } })
    }
  }

  return NextResponse.json({ error: 'ההקלטה לא נמצאה' }, { status: 404 })
}
