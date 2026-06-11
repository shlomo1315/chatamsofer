import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// Returns all mail accounts: the main connected Gmail + any profiles with domain email
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  // Fetch all active profiles
  const { data: profiles } = await admin
    .from('profiles')
    .select('id,full_name,email,role,mail_account')
    .eq('is_active', true)

  // Collect domain accounts from profiles (e.g. @chasamsofer.info)
  const DOMAIN = process.env.MAIL_DOMAIN ?? 'chasamsofer.info'
  const seen = new Set<string>()

  // Main account always first
  const mainEmail = process.env.GMAIL_EMAIL ?? `office@${DOMAIN}`
  seen.add(mainEmail)

  const accounts: { name: string; email: string; isMain: boolean; profileId?: string }[] = [
    { name: 'משרד ראשי', email: mainEmail, isMain: true },
  ]

  for (const p of profiles ?? []) {
    if (!p.email) continue
    const isDomain = p.email.endsWith(`@${DOMAIN}`)
    if (isDomain && !seen.has(p.email)) {
      seen.add(p.email)
      accounts.push({ name: p.full_name ?? p.email, email: p.email, isMain: false, profileId: p.id })
    }
  }

  // Also include any mail_account values that are domain emails
  for (const p of profiles ?? []) {
    if (!p.mail_account) continue
    const isDomain = (p.mail_account as string).endsWith(`@${DOMAIN}`)
    if (isDomain && !seen.has(p.mail_account as string)) {
      seen.add(p.mail_account as string)
      accounts.push({ name: p.mail_account as string, email: p.mail_account as string, isMain: false })
    }
  }

  return NextResponse.json({ accounts })
}
