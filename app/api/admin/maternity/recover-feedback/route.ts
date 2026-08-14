// ─────────────────────────────────────────────────────────────────────────────
// שחזור למפרע של משובים ומכתבי ברכה שהגיעו במייל ולא נקלטו.
//
// 🔴 הרקע: Google Workspace עושה dual-delivery ו"אוכל" את כתובת המענה
// (office+s<token>@). הטוקן לא הגיע, הקוד חזר false בשקט, והמשוב לא נקלט.
//
// ⚠️ המיילים עצמם *לא אבדו* — כל מייל נכנס נשמר ב-inbound_emails לפני
// הניתוב. המסלול הזה עובר עליהם, מזהה לפי הנושא והשולחת, וקולט את מה
// שנשמט. מריצים אותו פעם אחת אחרי הפריסה.
//
// GET  — תצוגה מקדימה: מה יישחזר, בלי לכתוב כלום.
// POST — ביצוע בפועל.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import {
  looksLikeFeedbackReply, looksLikeGratitudeReply,
  findAidBySenderEmail, handleFeedbackReply, handleGratitudeReply,
} from '@/lib/inboundGratitude'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ⚠️ עותק מצומצם של הממיר מה-webhook. הועתק במכוון ולא יוצא לשיתוף:
// זהו מסלול שחזור חד-פעמי, ושינוי חתימה של פונקציה שה-webhook החי נשען
// עליה כדי לחסוך שכפול של 10 שורות אינו שווה את הסיכון.
function htmlToPlainText(html: string): string {
  return String(html || '')
    .replace(/\r\n?/g, '\n')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|li|h[1-6]|table|ul|ol|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type Row = {
  id: string
  from_email: string | null
  subject: string | null
  plain_text: string | null
  html: string | null
  created_at: string
}

async function run(dryRun: boolean) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'שגיאת תצורה' }, { status: 500 })
  }
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // כל המיילים הנכנסים שהנושא שלהם נראה כתשובת משוב או ברכה.
  const { data, error } = await admin
    .from('inbound_emails')
    .select('id, from_email, subject, plain_text, html, created_at')
    .order('created_at', { ascending: true })
    .limit(2000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Row[]
  const results: { subject: string; from: string; kind: string; outcome: string }[] = []
  let recovered = 0

  for (const row of rows) {
    const subject = row.subject ?? ''
    const isFeedback = looksLikeFeedbackReply(subject)
    const isGratitude = looksLikeGratitudeReply(subject)
    if (!isFeedback && !isGratitude) continue

    const from = row.from_email ?? ''
    const kind = isFeedback ? 'משוב' : 'מכתב ברכה'
    const table = isFeedback ? 'survey_responses' : 'gratitude_letters'

    const match = await findAidBySenderEmail(admin, from, table)
    if (!match) {
      results.push({ subject, from, kind, outcome: 'לא נמצא שיוך — נדרש טיפול ידני' })
      continue
    }

    if (dryRun) {
      results.push({ subject, from, kind, outcome: `ישוחזר → לידה ${match.aidId}` })
      recovered++
      continue
    }

    const body = (row.plain_text && row.plain_text.trim())
      ? row.plain_text
      : htmlToPlainText(row.html ?? '')
    const ctx = { recipients: [], body, attachments: [] }

    const ok = isFeedback
      ? await handleFeedbackReply(admin, ctx, match.aidId)
      : await handleGratitudeReply(admin, ctx, match.aidId)

    if (ok) recovered++
    results.push({
      subject, from, kind,
      outcome: ok ? `שוחזר → לידה ${match.aidId}` : 'הקליטה נכשלה (ייתכן שכבר קיים)',
    })
  }

  return NextResponse.json({
    dryRun,
    scanned: rows.length,
    matched: results.length,
    recovered,
    results,
  })
}

// 🔴 אימות הרשאה חובה בכל מסלול API.
//
// proxy.ts מחריג במפורש את `api` מה-matcher שלו (שורה 135), ולכן *אין*
// שום שכבת הגנה במעלה הזרם — כל מסלול מגן על עצמו בלבד. המסלול הזה
// עובד ב-service-role (עוקף RLS), קורא את כל תיבת הדואר הנכנס וכותב
// לטבלאות המשוב והברכות; בלי הבדיקה הוא היה פתוח לכל אדם באינטרנט.
export async function GET(_request: NextRequest) {
  if (!(await requirePermission('maternity', 'edit'))) return forbidden()
  return run(true)
}

export async function POST(_request: NextRequest) {
  if (!(await requirePermission('maternity', 'edit'))) return forbidden()
  return run(false)
}
