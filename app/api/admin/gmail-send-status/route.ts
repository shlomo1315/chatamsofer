import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { listSendAccounts, removeSendAccount } from '@/lib/gmail'
import { gmailCounterKey, GMAIL_CAP_HIGH } from '@/lib/sendMail'

export const dynamic = 'force-dynamic'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// חשבונות השליחה במאגר + הניצול היומי של כל אחד.
// ⚠️ הניצול חשוב לא פחות מהרשימה: בלעדיו אי אפשר לדעת אם צריך להוסיף חשבון
// נוסף לפני שהמכסה נגמרת — וזה מתגלה רק כשמיילים מפסיקים להגיע.
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  try {
    const accounts = await listSendAccounts()
    const db = admin()
    const used: Record<string, number> = {}

    if (db && accounts.length) {
      const keys = accounts.map(a => gmailCounterKey(a.email))
      const { data } = await db.from('app_settings').select('key, value').in('key', keys)
      for (const row of (data ?? []) as { key: string; value: unknown }[]) {
        used[row.key] = Number(row.value ?? 0) || 0
      }
    }

    return NextResponse.json({
      cap: GMAIL_CAP_HIGH,
      accounts: accounts.map(a => ({
        email: a.email,
        addedAt: a.addedAt ?? null,
        usedToday: used[gmailCounterKey(a.email)] ?? 0,
      })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[gmail-send-status]', e)
    return NextResponse.json({ cap: GMAIL_CAP_HIGH, accounts: [] })
  }
}

// הסרת חשבון מהמאגר.
export async function DELETE(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const email = request.nextUrl.searchParams.get('email')?.trim()
  if (!email) return NextResponse.json({ error: 'חסרה כתובת' }, { status: 400 })

  await removeSendAccount(email)
  console.log(`[gmail-send] חשבון שליחה הוסר מהמאגר: ${email}`)
  return NextResponse.json({ ok: true })
}
