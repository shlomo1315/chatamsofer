import { NextResponse, type NextRequest } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { saveLegacyRefreshToken, getLegacyOAuthClient } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'
import { DEFAULT_LABELS } from '@/lib/mailLabels'

export const dynamic = 'force-dynamic'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const code = request.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const oauth = getLegacyOAuthClient()
  const { tokens } = await oauth.getToken(code)
  if (!tokens.refresh_token) {
    return new NextResponse(
      `<html><body dir="rtl" style="font-family:sans-serif;padding:40px"><h2>שגיאה</h2><p>לא התקבל refresh token. נסה שוב וודא שלחצת "Allow".</p><a href="/admin/settings/connect-mailbox">נסה שוב</a></body></html>`,
      { headers: { 'Content-Type': 'text/html' } },
    )
  }

  // המחלקה שנבחרה לפני ההפניה ל-Google (נישאת ב-state, מקודדת base64url)
  let department: string | null = null
  let label = ''
  let labelId = ''       // תווית קיימת שנבחרה
  let labelName = ''     // שם לתווית חדשה שתיווצר
  let labelColor = '#6366f1'
  try {
    const raw = request.nextUrl.searchParams.get('state') ?? ''
    if (raw) {
      const decoded = Buffer.from(raw, 'base64url').toString('utf-8')
      const state = JSON.parse(decoded)
      if (state.department && state.department in DEPARTMENTS) department = state.department
      label = String(state.label ?? '').slice(0, 60)
      labelId = String(state.labelId ?? '').slice(0, 60)
      labelName = String(state.labelName ?? '').slice(0, 60).trim()
      if (state.color) labelColor = String(state.color).slice(0, 20)
    }
  } catch { /* state לא תקין — ניפול לתיבה הישנה */ }

  // התיבה שחוברה — שולפים את כתובתה בפועל מ-Gmail
  let mailboxEmail = ''
  try {
    oauth.setCredentials(tokens)
    const gmail = google.gmail({ version: 'v1', auth: oauth })
    const profile = await gmail.users.getProfile({ userId: 'me' })
    mailboxEmail = (profile.data.emailAddress ?? '').toLowerCase().trim()
  } catch (e) {
    console.error('[gmail-legacy/callback] getProfile failed:', e)
  }

  const db = admin()

  if (department && mailboxEmail && db) {
    // תווית התיבה: אם נבחרה קיימת — משתמשים בה; אם הוקלד שם חדש — יוצרים תווית
    // ב-mail_label_defs (אותו מנגנון כמו create_label) ומקבלים id.
    let resolvedLabelId = labelId || null
    if (!resolvedLabelId && labelName) {
      try {
        const { data: cur } = await db.from('app_settings').select('value').eq('key', 'mail_label_defs').maybeSingle()
        // ⚠️ ברירת המחדל חייבת להיות DEFAULT_LABELS ולא [] — 6 התוויות המובנות
        // קיימות רק כ-fallback בקוד ולא נשמרות ב-DB. אם נכתוב [newLabel] בלבד,
        // כל התוויות המובנות ייעלמו לצמיתות מכל מסכי המייל. זהה ל-create_label הקנוני.
        let labels: { id: string; name: string; color: string }[]
        try { labels = cur?.value ? JSON.parse(cur.value as string) : [...DEFAULT_LABELS] } catch { labels = [...DEFAULT_LABELS] }
        // שם שכבר קיים — שימוש חוזר במקום כפילות
        const existing = labels.find(l => l.name === labelName)
        if (existing) {
          resolvedLabelId = existing.id
        } else {
          const newLabel = { id: crypto.randomUUID(), name: labelName, color: labelColor }
          labels.push(newLabel)
          await db.from('app_settings').upsert({
            key: 'mail_label_defs',
            value: JSON.stringify(labels),
            updated_at: new Date().toISOString(),
          })
          resolvedLabelId = newLabel.id
        }
      } catch (e) {
        console.error('[gmail-legacy/callback] label create failed (non-blocking):', e)
      }
    }

    // רישום התיבה בטבלה — מחלקה + תווית + טוקן פר-תיבה
    const { error } = await db.from('gmail_accounts').upsert({
      email: mailboxEmail,
      label: label || labelName || DEPARTMENTS[department as DepartmentKey].label,
      department,
      label_id: resolvedLabelId,
      refresh_token: tokens.refresh_token,
      is_active: true,
    }, { onConflict: 'email' })

    if (error) console.error('[gmail-legacy/callback] gmail_accounts upsert:', error.message)
  } else {
    // אין מחלקה בחיבור (זרימה ישנה) — נשמר בטוקן הגלובלי לתאימות לאחור.
    await saveLegacyRefreshToken(tokens.refresh_token)
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')
  return NextResponse.redirect(`${base}/admin/settings`)
}
