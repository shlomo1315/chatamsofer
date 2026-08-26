import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { buildGratitudeBatchLetters } from '@/lib/gratitudeBatchLetters'
import { GRATITUDE_LETTER_SELECT, type GratitudeLetterRow } from '../[id]/shared'
import type { BatchFilters, SentFilter, StatusFilter } from '@/lib/gratitudeBatch'

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

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return forbidden('הפקת הקובץ שמורה לצוות')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let input: { from?: string | null; to?: string | null; sent?: string; status?: string }
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  // ⚠️ ערכים לא מוכרים נופלים ל'all' ולא נשלחים כמות שהם לפילוח: כך
  // בקשה משובשת מחזירה יותר מדי ולא פחות מדי, וזה הצד הבטוח.
  const SENT: SentFilter[] = ['all', 'unsent', 'sent']
  const STATUS: StatusFilter[] = ['all', 'approved', 'received', 'rejected']
  const filters: BatchFilters = {
    from: (input.from ?? '').trim() || null,
    to: (input.to ?? '').trim() || null,
    sent: SENT.includes(input.sent as SentFilter) ? (input.sent as SentFilter) : 'all',
    status: STATUS.includes(input.status as StatusFilter) ? (input.status as StatusFilter) : 'all',
  }

  const { data, error } = await db
    .from('gratitude_letters')
    .select(GRATITUDE_LETTER_SELECT)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const letters = (data ?? []) as unknown as GratitudeLetterRow[]

  try {
    const bytes = await buildGratitudeBatchLetters({ letters, filters })
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        // ⚠️ שם הקובץ נשלח מקודד: שם עברי ב-Content-Disposition ללא
        // filename* נשבר לג'יבריש בחלק מהדפדפנים.
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('מכתבי ברכה.pdf')}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה בהפקת הקובץ' }, { status: 500 })
  }
}
