import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const q      = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const email  = request.nextUrl.searchParams.get('email')?.trim() ?? ''
  const emails = request.nextUrl.searchParams.get('emails')?.trim() ?? ''   // comma-separated batch
  const exact  = request.nextUrl.searchParams.get('exact') === '1'
  const limit  = Number(request.nextUrl.searchParams.get('limit') ?? 8)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const idNumber = request.nextUrl.searchParams.get('id_number')?.trim() ?? ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = admin.from('beneficiaries').select('id,full_name,family_name,email,phone,city,eligibility_status,children_count').limit(limit)

  if (emails) {
    const list = emails.split(',').map(e => e.trim()).filter(Boolean)
    query = admin.from('beneficiaries').select('id,full_name,family_name,email,phone,city,eligibility_status,children_count').in('email', list).limit(list.length + 10)
  } else if (idNumber) {
    query = admin.from('beneficiaries')
      .select('id,full_name,family_name,email,phone,city,eligibility_status,children_count,spouse_name,spouse_id_number')
      .or(`id_number.eq.${idNumber},spouse_id_number.eq.${idNumber}`)
      .limit(5)
  } else if (email && exact) {
    query = query.eq('email', email)
  } else if (email) {
    query = query.ilike('email', `%${email}%`)
  } else if (q) {
    query = query.or(`full_name.ilike.%${q}%,family_name.ilike.%${q}%,email.ilike.%${q}%`)
  }

  const { data } = await query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = (data ?? []).map((b: any) => ({
    ...b,
    name: [b.family_name, b.full_name].filter(Boolean).join(' '),
  }))

  return NextResponse.json({ results })
}
