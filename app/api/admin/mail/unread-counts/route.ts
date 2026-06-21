import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized, allowedMailboxKeys } from '@/lib/apiAuth'
import { DEPARTMENTS } from '@/lib/departments'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// מחזיר { byDepartment: { [deptKey]: count }, total: number }
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const admin = getAdminClient()

  const { data, error } = await admin
    .from('inbound_emails')
    .select('to_email')
    .eq('is_read', false)
    .eq('is_spam', false)

  if (error) {
    // אם הטבלה לא קיימת — מחזירים אפסים במקום שגיאה
    return NextResponse.json({ byDepartment: {}, total: 0, error: error.message })
  }

  const countByEmail: Record<string, number> = {}
  for (const row of data ?? []) {
    countByEmail[row.to_email] = (countByEmail[row.to_email] ?? 0) + 1
  }

  // משתמש מוגבל רואה ספירות רק לתיבות שהוקצו לו
  const allowed = allowedMailboxKeys(staff)
  const byDepartment: Record<string, number> = {}
  let total = 0
  for (const dep of Object.values(DEPARTMENTS)) {
    if (allowed !== null && !allowed.includes(dep.key)) continue
    const c = countByEmail[dep.email] ?? 0
    byDepartment[dep.key] = c
    total += c
  }

  return NextResponse.json({ byDepartment, total })
}
