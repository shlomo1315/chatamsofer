import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// כתובות השלוחות להדבקה בימות — **עם** ה-ApiToken.
//
// 🔴 למה זה קיים: כל וובהוקי המערכת נכשלים-סגור על ApiToken. המסכים
// הציגו את הכתובת בלי הטוקן, המנהל הדביק אותה בימות בדיוק כפי שהוצגה,
// וכל שיחה נענתה ב"אין הרשאה" וניתקה מיד. הכתובת שהוצגה לא יכלה
// לעבוד לעולם, ולא היה שום רמז לכך במסך.
//
// ⚠️ נבנה בשרת ולא בלקוח: הטוקן חסוי, והנתיב מוגן למנהלים בלבד.
//
// ⚠️ ימות מעבירה את פרמטרי הכתובת בכל בקשה בשיחה, ולכן הטוקן מגיע
// מאליו בכל צעד — אין צורך להוסיף אותו לכל שלב בנפרד.
// ─────────────────────────────────────────────────────────────────────────────

/** השלוחות שיש להן וובהוק. המפתחות זהים ל-id ב-lib/ivrMap. */
const PATHS: Record<string, string> = {
  menu: '/api/webhooks/yemot',
  holiday: '/api/webhooks/yemot-holiday',
  maternity: '/api/webhooks/yemot-maternity',
  otp: '/api/webhooks/yemot-otp',
}

export async function GET(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return unauthorized()

  const envBase = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
  const base = envBase || (() => {
    const host = request.headers.get('host') ?? 'chasamsofer.co.il'
    const proto = host.startsWith('localhost') ? 'http' : 'https'
    return `${proto}://${host}`
  })()

  const secret = process.env.YEMOT_WEBHOOK_SECRET ?? ''
  const qs = secret ? `?ApiToken=${encodeURIComponent(secret)}` : ''

  const urls: Record<string, string> = {}
  for (const [id, path] of Object.entries(PATHS)) urls[id] = `${base}${path}${qs}`

  return NextResponse.json({
    urls,
    // 🔴 נאמר במפורש: בלי הסוד הכתובות שמוצגות לא יעבדו, וזה חייב
    // להיראות במסך ולא רק בלוג של השרת.
    hasSecret: !!secret,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
