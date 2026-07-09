import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { getLegacyRefreshToken } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()
  const db = admin()
  const token = await getLegacyRefreshToken()
  const { data: sync } = await db.from('app_settings').select('value, updated_at').eq('key', 'legacy_mail_last_sync').maybeSingle()
  const { count } = await db.from('inbound_emails').select('id', { count: 'exact', head: true }).eq('source', 'legacy').is('beneficiary_id', null)
  return NextResponse.json({ connected: !!token, lastSync: sync?.updated_at ?? null, unmatched: count ?? 0 })
}
