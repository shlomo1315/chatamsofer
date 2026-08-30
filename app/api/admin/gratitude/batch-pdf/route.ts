import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { buildGratitudeBatchLetters } from '@/lib/gratitudeBatchLetters'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'
import { GRATITUDE_LETTER_SELECT, type GratitudeLetterRow } from '../[id]/shared'
import type { BatchFilters, SentFilter } from '@/lib/gratitudeBatch'

// ─────────────────────────────────────────────────────────────────────────────
// הפקת הקובץ המרוכז של הברכות — בשרת.
//
// 🔴 כל ברכה בדף נפרד, בעיצוב הבלאנק — בדיוק כמו הברכה הבודדת שנשלחת
// לנדיב. קודם הופקה כאן רשימה מנהלית של כרטיסים דחוסים; היא שירתה מעקב
// פנימי, אך לא הייתה ראויה למסירה לנדיב.
//
// ⚠️ אותה שאילתה (GRATITUDE_LETTER_SELECT) ואותו מיפוי (voucherInputFromRow)
// כמו הברכה הבודדת — אחרת המכתב המרוכז היה יוצא חסר שדות בשקט.
//
// ⚠️ runtime = 'nodejs' מפורש: pdf-lib עם fontkit דורש Buffer, ו-edge
// אינו מספק אותו.
//
// ⚠️ הקובץ נבנה מהמסד ולא מנתונים שהדפדפן שולח: לקוח יכול לבקש כל טווח,
// אבל לא להזריק תוכן ברכות שלא קיים.
//
// 🔒 צוות בלבד.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// ⚠️ כל ברכה היא מסמך PDF שנבנה ומועתק בנפרד. מנה גדולה איטית מרשימה
// אחת, ולכן התקרה גבוהה מברירת המחדל.
export const maxDuration = 300

async function generateBatchPdf(input: { from?: string | null; to?: string | null; sent?: string }) {
  const staff = await requireStaff()
  if (!staff) return forbidden('הפקת הקובץ שמורה לצוות')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ ערכים לא מוכרים נופלים ל'all' ולא נשלחים כמות שהם לפילוח: כך
  // בקשה משובשת מחזירה יותר מדי ולא פחות מדי, וזה הצד הבטוח.
  const SENT: SentFilter[] = ['all', 'unsent', 'sent']
  const filters: BatchFilters = {
    from: (input.from ?? '').trim() || null,
    to: (input.to ?? '').trim() || null,
    sent: SENT.includes(input.sent as SentFilter) ? (input.sent as SentFilter) : 'all',
  }

  // 🔴 מסננים ב-SQL ולא רק בזיכרון.
  //
  // ⚠️ קודם נשלפו *כל* מכתבי הברכה שאי פעם נקלטו — עם גוף המכתב המלא
  // והג'וינים — ורק אז סוננו ב-JS. ככל שהארכיון גדל זו הפכה לשליפה כבדה
  // שיכולה להפיל את התהליך עוד לפני שהתחילה בניית ה-PDF, וכשל כזה חוזר
  // כ-502 בלי גוף JSON — כלומר בלי שום הודעת שגיאה מובנת למשתמש.
  let query = db.from('gratitude_letters').select(GRATITUDE_LETTER_SELECT)
  if (filters.from) query = query.gte('created_at', filters.from)
  // ⚠️ עד-תאריך כולל את היום עצמו במלואו, ולכן משווים לתחילת היום שאחריו.
  if (filters.to) {
    const next = new Date(filters.to)
    next.setDate(next.getDate() + 1)
    query = query.lt('created_at', next.toISOString().slice(0, 10))
  }
  if (filters.sent === 'unsent') query = query.is('sent_to_donor_at', null)
  if (filters.sent === 'sent') query = query.not('sent_to_donor_at', 'is', null)

  const { data, error } = await query.order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const letters = (data ?? []) as unknown as GratitudeLetterRow[]

  try {
    const bytes = await buildGratitudeBatchLetters({ letters, filters })

    // 🔴 הקובץ נשלח כ*נתונים* ולא כקובץ — אותו ערוץ כמו /api/files/data.
    //
    // ⚠️ נטפרי מזהה תגובה לפי סוג התוכן שלה. תגובת application/pdf היא
    // "קובץ" ונחסמת ב-418 Blocked by NetFree — וזה בדיוק מה שקרה כאן:
    // ההורדה המרוכזת נכשלה אצל כל מי שגולש דרך הסינון.
    //
    // ⚠️ המטען מעורבל לפני ה-base64. בלעדיו ה-base64 נושא את חתימת ה-PDF
    // ("JVBERi") בתחילתו, והמסנן מזהה אותה גם בתוך JSON. הדפדפן מבטל את
    // הערבול בזיכרון ומרכיב Blob מקומי (ראו lib/docCipher, lib/docBlob).
    const scrambled = scrambleBytes(new Uint8Array(bytes))
    return NextResponse.json({
      name: 'מכתבי ברכה.pdf',
      contentType: 'application/pdf',
      size: bytes.length,
      enc: DOC_CIPHER_ID,
      data: Buffer.from(scrambled).toString('base64'),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה בהפקת הקובץ' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  return generateBatchPdf({
    from: searchParams.get('from'),
    to: searchParams.get('to'),
    sent: searchParams.get('sent') ?? undefined,
  })
}

export async function POST(request: NextRequest) {
  let input: { from?: string | null; to?: string | null; sent?: string }
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  return generateBatchPdf(input)
}
