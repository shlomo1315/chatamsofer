import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

// טבלאות מותרות לחיפוש "הבקשה הממתינה הבאה"
const ALLOWED: Record<string, string> = {
  loans: 'pending',
  maternity_aids: 'pending',
  financial_aid_requests: 'pending',
  widow_requests: 'pending',
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function verifyStaff() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// מחזיר את מזהה הבקשה הממתינה הבאה (לפי סדר כניסה), או null אם אין.
export async function GET(request: NextRequest) {
  if (!(await verifyStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const url = new URL(request.url)
  const table = url.searchParams.get('table') ?? ''
  const currentId = url.searchParams.get('currentId') ?? ''
  const pendingParam = url.searchParams.get('pending')
  if (!(table in ALLOWED)) return NextResponse.json({ error: 'טבלה לא נתמכת' }, { status: 400 })

  const pendingValues = pendingParam ? pendingParam.split(',').map(s => s.trim()).filter(Boolean) : [ALLOWED[table]]

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ id: null })

  let q = admin.from(table).select('id').in('status', pendingValues).order('created_at', { ascending: true }).limit(1)
  if (currentId) q = q.neq('id', currentId)
  const { data } = await q
  return NextResponse.json({ id: (data?.[0] as { id?: string } | undefined)?.id ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}
