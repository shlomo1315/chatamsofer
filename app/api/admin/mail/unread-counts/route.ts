import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireMailAccess, unauthorized, allowedMailboxKeys } from '@/lib/apiAuth'
import { DEPARTMENTS } from '@/lib/departments'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ׳׳—׳–׳™׳¨ { byDepartment: { [deptKey]: count }, total: number }
export async function GET() {
  const staff = await requireMailAccess()
  if (!staff) return unauthorized()

  const admin = getAdminClient()

  // ׳׳©׳×׳׳© ׳׳•׳’׳‘׳ ׳¨׳•׳׳” ׳¡׳₪׳™׳¨׳•׳× ׳¨׳§ ׳׳×׳™׳‘׳•׳× ׳©׳”׳•׳§׳¦׳• ׳׳•
  const allowed = allowedMailboxKeys(staff)
  // ג ן¸ ׳×׳™׳‘׳•׳× noReply ׳׳“׳•׳׳’׳•׳× ׳׳’׳׳¨׳™: ׳”׳ ׳׳•׳˜׳•׳׳˜׳™׳•׳× ׳•׳׳™׳© ׳׳™׳ ׳• ׳¢׳•׳ ׳” ׳‘׳”׳, ׳•׳׳׳₪׳™
  // ׳”׳”׳•׳“׳¢׳•׳× ׳©׳ ׳¦׳‘׳¨׳• ׳‘׳”׳ ׳ ׳™׳₪׳—׳• ׳׳× "׳›׳ ׳”׳׳—׳׳§׳•׳×" ׳•׳”׳¡׳×׳™׳¨׳• ׳׳× ׳׳” ׳©׳‘׳׳׳× ׳׳׳×׳™׳.
  // ׳’׳ ׳—׳•׳¡׳ ׳©׳׳™׳׳×׳× count ׳׳—׳× ׳‘׳›׳ ׳¡׳§׳¨ (׳¨׳¥ ׳›׳ 3 ׳“׳§׳•׳× ׳׳›׳ ׳׳ ׳”׳ ׳׳—׳•׳‘׳¨).
  const deps = Object.values(DEPARTMENTS)
    .filter(dep => !dep.noReply)
    .filter(dep => allowed === null || allowed.includes(dep.key))

  // ׳¡׳₪׳™׳¨׳” ׳‘׳¦׳“ ׳”-DB ׳׳›׳ ׳×׳™׳‘׳” ׳‘׳׳§׳‘׳™׳ (head:true ג€” ׳׳—׳–׳™׳¨ count ׳‘׳׳‘׳“, ׳‘׳׳™ ׳׳”׳¢׳‘׳™׳¨ ׳©׳•׳¨׳•׳×).
  // ׳׳—׳׳™׳£ ׳׳©׳™׳›׳” ׳©׳ ׳›׳ ׳”׳©׳•׳¨׳•׳× ׳”׳׳-׳ ׳§׳¨׳׳•׳× ׳•׳¡׳₪׳™׳¨׳×׳ ׳‘-JS ג€” ׳—׳•׳¡׳ ׳”׳¢׳‘׳¨׳× ׳׳׳•׳×/׳׳׳₪׳™ ׳©׳•׳¨׳•׳× ׳‘׳›׳ ׳§׳¨׳™׳׳”.
  const results = await Promise.all(deps.map(async dep => {
    const { count, error } = await admin
      .from('inbound_emails')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('is_spam', false)
      .eq('to_email', dep.email)
    return { key: dep.key, count: error ? 0 : (count ?? 0) }
  }))

  const byDepartment: Record<string, number> = {}
  let total = 0
  for (const r of results) {
    byDepartment[r.key] = r.count
    total += r.count
  }

  return NextResponse.json({ byDepartment, total })
}
