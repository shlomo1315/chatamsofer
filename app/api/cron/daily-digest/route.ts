import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronSecret } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// ─────────────────────────────────────────────────────────────────────────────
// סיכום יומי אוטומטי — רץ בחצות שעון ישראל.
//
// הרצה: GET עם ?token=<CRON_SECRET> או Authorization: Bearer.
// בשרת: Cron Service בביטוי `0 0 * * *` עם TZ=Asia/Jerusalem.
//
// 🔴 לא נשלח בשבתות ובחגים — isBlockedForMail היא אותה פונקציה שכל מיילי
// המערכת עוברים דרכה. מימוש מקומי היה נפרד ממנה בעדכון הראשון של לוח
// המועדים.
//
// ⚠️ נבדק *מועד השליחה* ולא היום שעליו מדווחים: מייל שיוצא במוצאי שבת
// מסכם גם את השבת, וזה תקין. מה שאסור הוא לשלוח בתוך השבת עצמה.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // נכשל-סגור: בלי CRON_SECRET תואם — חסום.
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // הסיכום היומי בוטל לבקשת שלמה (11.11.2026) — לא נשלח יותר, בלי קשר להגדרות.
  console.log('[daily-digest] מבוטל — לא נשלח')
  return NextResponse.json({ ok: true, skipped: 'cancelled' })
}
