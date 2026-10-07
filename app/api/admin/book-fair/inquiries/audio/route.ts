import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { archiveInquiryRecording, inquiryStorageKey } from '@/lib/bookFairInquiryAudio'

// הקלטת פנייה להאזנה בדפדפן.
//
// 🔴 מוגש דרך השרת ולא בקישור ישיר: כתובת ההורדה של ימות דורשת את
// YEMOT_TOKEN, וקישור שכולל אותו היה חושף את מפתח המערכת בכל דף.
//
// 🔴 הקובץ נמצא לפי נתוני הפנייה במסד ולא לפי פרמטר: קבלת path מהלקוח
// הייתה מאפשרת לקרוא *כל* קובץ בחשבון ימות.
//
// 🔴 08.10: קודם נבנה כאן נתיב מהעמודה recording — "120/9.wav", זהה לכל
// הפניות ואינו נתיב בכלל — ונוסף לו .wav שני. כל ניסיון החזיר 404 והמסך
// הציג "הדפדפן לא הצליח לנגן". ראו lib/bookFairInquiryAudio.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function audio(data: ArrayBuffer) {
  return new NextResponse(data, {
    headers: {
      'Content-Type': 'audio/wav',
      // ⚠️ no-store: ההקלטות אישיות ואין סיבה שיישמרו במטמון של דפדפן
      // משותף במשרד.
      'Cache-Control': 'no-store',
    },
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

  // 1. העותק שלנו — נשמר בסיום השיחה או בהשמעה קודמת.
  const { data: blob } = await db.storage.from('documents').download(inquiryStorageKey(callId))
  if (blob) return audio(await blob.arrayBuffer())

  // 2. סל המיחזור של ימות — לפי הטלפון והזמן. נמצא ⇒ נשמר עותק לפעם הבאה.
  const data = await archiveInquiryRecording(db, callId, String(row.phone ?? ''), new Date(row.created_at))
  if (data) return audio(data)

  console.error(`[fair/inquiries/audio] ההקלטה לא נמצאה · פנייה ${id}`)
  return NextResponse.json(
    { error: 'ההקלטה כבר לא נמצאת בימות (נמחקה מסל המיחזור)' },
    { status: 404 },
  )
}
