import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { downloadFileFromYemot } from '@/lib/yemot'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

// ─────────────────────────────────────────────────────────────────────────────
// הקלטת הכתובת/השם של הזמנה טלפונית — להאזנה במסך ההזמנה.
//
// 🔴 הראוט הזה לא היה קיים: המסך הצביע עליו ב-<audio src> וקיבל 404,
// ונגן ריק נראה בדיוק כמו הקלטה שלא נקלטה. פקיד שלא הצליח לשמוע את
// הכתובת לא יכול היה לאשר את ההזמנה לליקוט.
//
// 🔴 שם הקובץ נקרא מהמסד ולא מפרמטר: קבלת שם חופשי הייתה מאפשרת
// לקרוא כל קובץ בחשבון ימות, כולל הקלטות של שלוחות אחרות.
//
// ⚠️ ההקלטה מכילה שם וכתובת מלאה — ולכן נתיב מוגן בהרשאת צוות,
// ולא קישור ישיר לאחסון.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** ⚠️ ימות ממירה (convertAudio=1) ושומרת .wav, אבל נבדקות כל הסיומות. */
const EXTS = ['wav', 'mp3', 'ogg', 'm4a'] as const

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
    .select('provider_path, order_id').eq('id', recId).maybeSingle()

  if (!rec || rec.order_id !== id) {
    return NextResponse.json({ error: 'ההקלטה לא נמצאה' }, { status: 404 })
  }

  // 🔴 provider_path הוא *נתיב* ולא שם קובץ — "30/9.wav": ימות מחזירה
  // את תיקיית ההקלטה ואת מספר הקובץ בתוכה.
  //
  // ⚠️ הסרת הלוכסנים הרסה אותו ל-"309.wav" והקובץ לא נמצא לעולם —
  // זה מה שהחזיר "ההקלטה לא נמצאה בימות".
  //
  // ⚠️ הגנה מפני טיפוס מעלה (..) נשמרת, אבל לוכסן בודד מותר.
  const raw = String(rec.provider_path ?? '').trim()
  if (!raw || raw.includes('..') || raw.startsWith('/')) {
    return NextResponse.json({ error: 'אין קובץ להקלטה זו' }, { status: 404 })
  }

  // ⚠️ הנתיב כולל סיומת; אם לא — נבדקות האפשרויות.
  const candidates = /\.(wav|mp3|ogg|m4a)$/i.test(raw)
    ? [raw]
    : EXTS.map(e => `${raw}.${e}`)

  // ⚠️ שני נתיבים אפשריים: ימות מחזירה "30/9.wav" יחסית לשורש
  // ההקלטות, אבל בחלק מהתצורות הוא יחסי לשלוחה. נבדקים שניהם.
  const EXT_DIR = process.env.YEMOT_BOOK_FAIR_EXT || '9'
  const tried: string[] = []
  let audio: { data: ArrayBuffer; contentType: string } | null = null

  // 🔴 שני חשבונות ימות: היריד עבר לחשבון משלו (YEMOT_BOOK_FAIR_TOKEN)
  // ב-04.10 בערב, אבל הקלטות של הזמנות שקדמו לכך יושבות בחשבון הישן.
  // חיפוש רק בחדש החזיר "ההקלטה לא נמצאה" על כל ההזמנות של אותו יום.
  const scopes = ['bookFair', 'default'] as const

  for (const name of candidates) {
    for (const path of [`ivr2:/${name}`, `ivr2:/${EXT_DIR}/${name}`]) {
      for (const scope of scopes) {
        tried.push(`${scope}:${path}`)
        const f = await downloadFileFromYemot(path, scope)
        if (f.ok && f.data) {
          audio = { data: f.data, contentType: f.contentType ?? 'audio/wav' }
          break
        }
      }
      if (audio) break
    }
    if (audio) break
  }

  if (!audio) {
    // ⚠️ כל הנתיבים שנוסו בלוג: בלעדיהם אי אפשר לדעת אם השם שגוי,
    // התיקייה שגויה, או שהקובץ באמת נמחק מימות.
    console.error(`[orders/recording] לא נמצא. provider_path="${raw}" · נוסו: ${tried.join(' , ')}`)
    return NextResponse.json({ error: 'ההקלטה לא נמצאה בימות' }, { status: 404 })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 נשלח כ*נתונים* ולא כקובץ — נטפרי חוסמת תגובת audio/* ב-418,
  // וההאזנה נכשלה אצל כל מי שגולש דרך הסינון.
  //
  // ⚠️ המטען מעורבל לפני ה-base64, אחרת חתימת הקובץ ("RIFF") מזוהה
  // גם בתוך ה-JSON. הדפדפן מבטל את הערבול ומרכיב Blob מקומי.
  // ─────────────────────────────────────────────────────────────────────────
  const scrambled = scrambleBytes(new Uint8Array(audio.data))
  return NextResponse.json({
    contentType: audio.contentType,
    size: audio.data.byteLength,
    enc: DOC_CIPHER_ID,
    data: Buffer.from(scrambled).toString('base64'),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
