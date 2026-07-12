import { NextResponse, type NextRequest } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { saveLegacyRefreshToken, getLegacyOAuthClient } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

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
  try {
    const raw = request.nextUrl.searchParams.get('state') ?? ''
    if (raw) {
      const decoded = Buffer.from(raw, 'base64url').toString('utf-8')
      const state = JSON.parse(decoded)
      if (state.department && state.department in DEPARTMENTS) department = state.department
      label = String(state.label ?? '').slice(0, 60)
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
    // רישום התיבה בטבלה — כולל שיוך המחלקה
    const { error } = await db.from('gmail_accounts').upsert({
      email: mailboxEmail,
      label: label || DEPARTMENTS[department as DepartmentKey].label,
      department,
      refresh_token: tokens.refresh_token,
      is_active: true,
    }, { onConflict: 'email' })

    if (error) console.error('[gmail-legacy/callback] gmail_accounts upsert:', error.message)
  }

  // שמירה גם בטוקן הישן — הסנכרון הנוכחי עדיין קורא ממנו
  await saveLegacyRefreshToken(tokens.refresh_token)

  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')
  return NextResponse.redirect(`${base}/admin/settings`)
}
