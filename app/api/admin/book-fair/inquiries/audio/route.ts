import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { downloadFileFromYemot } from '@/lib/yemot'

// הקלטת פנייה להאזנה בדפדפן.
//
// 🔴 מוגש דרך השרת ולא בקישור ישיר: כתובת ההורדה של ימות דורשת את
// YEMOT_TOKEN, וקישור שכולל אותו היה חושף את מפתח המערכת בכל דף.
//
// 🔴 הנתיב נבנה מהמסד ולא מפרמטר: קבלת path מהלקוח הייתה מאפשרת
// לקרוא *כל* קובץ בחשבון ימות (כולל הקלטות של שלוחות אחרות).

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BOOK_FAIR_EXT = process.env.YEMOT_BOOK_FAIR_EXT || '9'

export async function GET(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'view')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const id = request.nextUrl.searchParams.get('id')?.trim() ?? ''
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const { data: row } = await db.from('book_fair_inquiries')
    .select('recording').eq('id', id).maybeSingle()
  if (!row?.recording) return NextResponse.json({ error: 'אין הקלטה לפנייה זו' }, { status: 404 })

  // ⚠️ שם הקובץ מגיע מימות ונשמר כמות שהוא. מנוקה מתווי נתיב כדי
  // שלא יוכל לטפס מחוץ לתיקיית השלוחה.
  const name = String(row.recording).replace(/[/\\]/g, '')
  const file = await downloadFileFromYemot(`ivr2:/${BOOK_FAIR_EXT}/${name}.wav`)

  if (!file.ok || !file.data) {
    console.error('[fair/inquiries/audio] הורדה נכשלה:', file.error)
    return NextResponse.json({ error: 'ההקלטה לא נמצאה' }, { status: 404 })
  }

  return new NextResponse(file.data, {
    headers: {
      'Content-Type': file.contentType ?? 'audio/wav',
      // ⚠️ no-store: ההקלטות אישיות ואין סיבה שיישמרו במטמון של דפדפן
      // משותף במשרד.
      'Cache-Control': 'no-store',
    },
  })
}
