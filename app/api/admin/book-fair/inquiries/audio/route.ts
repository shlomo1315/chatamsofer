import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { inquiryStorageKey } from '@/lib/bookFairInquiryAudio'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

// הקלטת פנייה להאזנה בדפדפן.
//
// 🔴 מוגש דרך השרת ולא בקישור ישיר: ההקלטה מכילה פרטים אישיים, ולכן
// נתיב מוגן בהרשאת צוות. הקובץ נמצא לפי נתוני הפנייה במסד ולא לפי פרמטר.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// 🔴 10.10: נתונים מעורבלים ב-JSON ולא תגובת audio/wav. השרת החזיר 200
// והדפדפן כתב "לא הצליח לנגן": נטפרי חוסם כל תגובה שנראית כקובץ.
// ראו lib/docCipher.
function audio(data: ArrayBuffer) {
  const scrambled = scrambleBytes(new Uint8Array(data))
  return NextResponse.json({
    contentType: 'audio/wav',
    enc: DOC_CIPHER_ID,
    data: Buffer.from(scrambled).toString('base64'),
  }, {
    // ⚠️ no-store: ההקלטות אישיות ואין סיבה שיישמרו במטמון של דפדפן
    // משותף במשרד.
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'view')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const id = request.nextUrl.searchParams.get('id')?.trim() ?? ''
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const { data: row } = await db.from('book_fair_inquiries')
    .select('id, phone, call_id, created_at, recording').eq('id', id).maybeSingle()
  if (!row?.recording) return NextResponse.json({ error: 'אין הקלטה לפנייה זו' }, { status: 404 })

  // ⚠️ פנייה בלי call_id (ישנה) — המזהה שלה משמש כמפתח העותק.
  const callId = String(row.call_id || row.id)

  const { data: blob } = await db.storage.from('documents').download(inquiryStorageKey(callId))
  if (blob) return audio(await blob.arrayBuffer())

  console.error(`[fair/inquiries/audio] ההקלטה לא נמצאה · פנייה ${id}`)
  return NextResponse.json({ error: 'ההקלטה לא נמצאה' }, { status: 404 })
}
