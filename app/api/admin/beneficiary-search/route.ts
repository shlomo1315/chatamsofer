import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const q     = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const email = request.nextUrl.searchParams.get('email')?.trim() ?? ''
  const exact = request.nextUrl.searchParams.get('exact') === '1'
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? 8)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  let query = admin.from('beneficiaries').select('id,full_name,family_name,email,phone,city,eligibility_status,children_count').limit(limit)

  if (email && exact) {
    query = query.eq('email', email)
  } else if (email) {
    query = query.ilike('email', `%${email}%`)
  } else if (q) {
    query = query.or(`full_name.ilike.%${q}%,family_name.ilike.%${q}%,email.ilike.%${q}%`)
  }

  const { data } = await query
  const results = (data ?? []).map(b => ({
    ...b,
    name: [b.family_name, b.full_name].filter(Boolean).join(' '),
  }))

  return NextResponse.json({ results })
}
