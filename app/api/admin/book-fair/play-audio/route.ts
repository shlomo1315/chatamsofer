import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { downloadFileFromYemot, bookFairPath } from '@/lib/yemot'
import { getBookFairMessages } from '@/lib/yemotBookFairMessages'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

// ─────────────────────────────────────────────────────────────────────────────
// השמעת הקלטה שכבר יושבת בימות — הודעה, ספר או קטגוריה.
//
// 🔴 למה זה נדרש: אחרי העלאת קובץ ידני לא הייתה שום דרך *לשמוע* מה
// באמת נשמר. המנהל העלה, קיבל "נשמר בהצלחה", וגילה רק בשיחה אמיתית
// שהועלה הקובץ הלא נכון — או שההקלטה הישנה עדיין מתנגנת מהמטמון.
//
// 🔴 הנתיב נבנה מהמסד ולא מפרמטר של הלקוח: קבלת שם קובץ חופשי הייתה
// מאפשרת לקרוא *כל* קובץ בחשבון ימות, כולל שלוחות אחרות.
//
// ⚠️ מוגש דרך השרת ולא בקישור ישיר: כתובת ההורדה של ימות דורשת את
// YEMOT_TOKEN, וקישור שכולל אותו היה חושף את מפתח המערכת בדף.
//
// ⚠️ שתי הסיומות נבדקות: ימות ממירה את מה שהעלינו (convertAudio=1)
// ושומרת כ-.wav, אבל קובץ שהועלה ידנית עשוי להישמר בסיומת המקורית.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** מוריד את הקובץ, מנסה את הסיומות האפשריות לפי הסדר. */
async function fetchAudio(baseName: string) {
  for (const ext of ['wav', 'mp3', 'ogg', 'm4a', 'mp4', 'webm'] as const) {
    const file = await downloadFileFromYemot(bookFairPath(`${baseName}.${ext}`), 'bookFair')
    if (file.ok && file.data) {
      return { data: file.data, contentType: file.contentType ?? `audio/${ext}` }
    }
  }
  return null
}

export async function GET(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const sp = request.nextUrl.searchParams
  const messageKey = sp.get('key')?.trim() ?? ''
  const bookId = sp.get('book_id')?.trim() ?? ''
  const category = sp.get('category')?.trim() ?? ''

  // ── איזו הקלטה מבוקשת — תמיד דרך המסד ──
  let baseName = ''

  if (messageKey) {
    const msgs = await getBookFairMessages()
    baseName = String(msgs[messageKey]?.audio ?? '')
  } else if (bookId) {
    const { data } = await db.from('book_fair_books')
      .select('audio_name').eq('id', bookId).maybeSingle()
    baseName = String(data?.audio_name ?? '')
  } else if (category) {
    const { data } = await db.from('app_settings')
      .select('value').eq('key', 'book_fair_category_audio').maybeSingle()
    // ⚠️ app_settings.value היא עמודת text — תמיד JSON.parse.
    let map: Record<string, string> = {}
    try { map = JSON.parse(String(data?.value ?? '{}')) } catch { /* ריק */ }
    baseName = String(map[category] ?? '')
  } else {
    return NextResponse.json({ error: 'יש לציין הודעה, ספר או קטגוריה' }, { status: 400 })
  }

  if (!baseName) {
    return NextResponse.json({ error: 'אין הקלטה לפריט זה' }, { status: 404 })
  }

  // ⚠️ ניקוי תווי נתיב: גם כשהשם מגיע מהמסד, אין סיבה לאפשר טיפוס
  // מחוץ לתיקיית השלוחה.
  const safe = baseName.replace(/[/\\]/g, '')
  const audio = await fetchAudio(safe)

  if (!audio) {
    console.error(`[book-fair/play-audio] הקובץ לא נמצא בימות: ${safe}`)
    return NextResponse.json({ error: 'הקובץ לא נמצא בימות' }, { status: 404 })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 האודיו נשלח כ*נתונים* ולא כקובץ — בדיוק כמו /api/files/data.
  //
  // ⚠️ נטפרי מזהה תגובה לפי סוג התוכן: תגובת audio/* היא "קובץ" ונחסמת
  // ב-418 Blocked by NetFree. ההשמעה נכשלה אצל כל מי שגולש דרך הסינון.
  //
  // ⚠️ המטען מעורבל לפני ה-base64 — בלעדיו ה-base64 נושא את חתימת
  // הקובץ ("RIFF" ל-WAV, "ID3" ל-MP3) והמסנן מזהה אותה גם בתוך JSON.
  // הדפדפן מבטל את הערבול ומרכיב Blob מקומי (ראו lib/docCipher).
  // ─────────────────────────────────────────────────────────────────────────
  const scrambled = scrambleBytes(new Uint8Array(audio.data))
  return NextResponse.json({
    contentType: audio.contentType,
    size: audio.data.byteLength,
    enc: DOC_CIPHER_ID,
    data: Buffer.from(scrambled).toString('base64'),
  }, {
    // 🔴 no-store: אחרי העלאה מחדש השם משתנה, אבל מטמון דפדפן על
    // אותה כתובת היה משמיע את הקודם — בדיוק הבלבול שהמסך בא למנוע.
    headers: { 'Cache-Control': 'no-store' },
  })
}
