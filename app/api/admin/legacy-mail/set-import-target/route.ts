import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, forbidden } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// קובע לאיזו כתובת Gmail להזריק את מיילי התיבה בייבוא. ריק/null = כתובת המחלקה.
export async function POST(request: NextRequest) {
  const staff = await requireAdmin()
  if (!staff) return forbidden()

  let body: { accountId?: string; email?: string | null }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.accountId) return NextResponse.json({ error: 'חסר מזהה תיבה' }, { status: 400 })

  const raw = (body.email ?? '').trim()
  // ולידציה בסיסית — כתובת מייל תקינה או ריק (איפוס לברירת המחדל).
  if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  }

  const { error } = await admin()
    .from('gmail_accounts')
    .update({ import_target_email: raw || null })
    .eq('id', body.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, email: raw || null })
}
