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

  // משתמש מוגבל רואה ספירות רק לתיבות שהוקצו לו
  const allowed = allowedMailboxKeys(staff)
  const deps = Object.values(DEPARTMENTS).filter(dep => allowed === null || allowed.includes(dep.key))

  // ספירה בצד ה-DB לכל תיבה במקביל (head:true — מחזיר count בלבד, בלי להעביר שורות).
  // מחליף משיכה של כל השורות הלא-נקראות וספירתן ב-JS — חוסך העברת מאות/אלפי שורות בכל קריאה.
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
