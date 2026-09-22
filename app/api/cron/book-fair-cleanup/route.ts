import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, verifyCronSecret, unauthorized, serverMisconfigured } from '@/lib/apiAuth'
import { runBookFairCleanup } from '@/lib/bookFairCleanup'

// הפעלה ידנית/חיצונית של ניקוי יריד הספרים.
//
// ⚠️ הלוגיקה עצמה יושבת ב-lib/bookFairCleanup — הראוט הוא מעטפת בלבד.
// הריצה השוטפת מגיעה מהמתזמן הפנימי (instrumentation.ts) שמייבא את
// הפונקציה ישירות, בלי לעבור דרך HTTP. הראוט נשאר כדי שאפשר יהיה
// להריץ ידנית, ולצורך cron חיצוני אם אי-פעם יוגדר כזה.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // ⚠️ verifyCronSecret נכשל-סגור: בלי CRON_SECRET מוגדר, חסום.
  if (!verifyCronSecret(request)) return unauthorized()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const res = await runBookFairCleanup(db)
  return NextResponse.json(res)
}
