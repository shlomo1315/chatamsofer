import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient, verifyCronSecret } from '@/lib/apiAuth'
import { buildDigestData, renderDigestHtml } from '@/lib/dailyDigest'
import { loadDigestSettings } from '@/app/api/admin/daily-digest/route'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { isBlockedForMail } from '@/lib/jewishCalendar'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// ─────────────────────────────────────────────────────────────────────────────
// סיכום יומי אוטומטי — רץ בחצות שעון ישראל.
//
// הרצה: GET עם ?token=<CRON_SECRET> או Authorization: Bearer.
// ב-Railway: Cron Service בביטוי `0 0 * * *` עם TZ=Asia/Jerusalem.
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

  const now = new Date()
  if (isBlockedForMail(now)) {
    console.log('[daily-digest] דילוג — שבת/חג')
    return NextResponse.json({ ok: true, skipped: 'shabbat_or_holiday' })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })

  const settings = await loadDigestSettings(db)
  if (!settings.enabled) return NextResponse.json({ ok: true, skipped: 'disabled' })
  if (!settings.emails.length) {
    console.warn('[daily-digest] מופעל אך אין נמענים')
    return NextResponse.json({ ok: true, skipped: 'no_recipients' })
  }

  const data = await buildDigestData(db, now)
  const html = renderDigestHtml(data)
  const subject = `סיכום יומי · ${data.dateLabel}${data.totalPending > 0 ? ` · ${data.totalPending} ממתינים` : ''}`

  // ⚠️ לכל נמען בנפרד — הרשימה פנימית, ושליחה משותפת הייתה חושפת את
  // כתובות המנהלים זה לזה.
  const results = await Promise.all(settings.emails.map(to =>
    deliverMail(to, subject, html, undefined, mailFor('main'))
      .then(r => ({ to, ok: r.ok }))
      .catch(() => ({ to, ok: false })),
  ))

  const sent = results.filter(r => r.ok).length
  console.log(`[daily-digest] נשלח ל-${sent}/${results.length} · ${data.totalPending} ממתינים`)
  return NextResponse.json({ ok: true, sent, total: results.length })
}
