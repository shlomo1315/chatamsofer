import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { syncLegacyMail } from '@/lib/legacyMailSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // משיכה ראשונה עלולה להיות ארוכה

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()
  try {
    const result = await syncLegacyMail(admin())
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('not connected')) return NextResponse.json({ error: 'התיבה הישנה אינה מחוברת. חבר אותה תחילה.' }, { status: 400 })
    console.error('[legacy-mail/sync]', msg)
    return NextResponse.json({ error: 'שגיאה במשיכת המיילים. נסה שוב.' }, { status: 500 })
  }
}
