import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

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
  } else if (idNumber && idNumber.replace(/\D/g, '')) {
    // ניטרול לספרות בלבד לפני בניית מסנן .or() (מניעת filter injection)
    const cleanId = idNumber.replace(/\D/g, '')
    // Try exact match first; also match id numbers stored with leading zero vs without
    const padded = cleanId.padStart(9, '0')
    const unpadded = cleanId.replace(/^0+/, '') || cleanId
    const idFilter = [
      `id_number.eq.${cleanId}`,
      `id_number.eq.${padded}`,
      `id_number.eq.${unpadded}`,
      `spouse_id_number.eq.${cleanId}`,
      `spouse_id_number.eq.${padded}`,
      `spouse_id_number.eq.${unpadded}`,
    ].join(',')
    query = admin.from('beneficiaries')
      .select('id,full_name,family_name,email,phone,city,eligibility_status,children_count,spouse_name,spouse_id_number')
      .or(idFilter)
      .limit(5)
  } else if (email && exact) {
    query = admin.from('beneficiaries')
      .select('id,full_name,family_name,email,phone,city,eligibility_status,children_count,address,spouse_name,marital_status,lineage_manual,id_number')
      .eq('email', email)
      .limit(1)
  } else if (email) {
    query = query.ilike('email', `%${email.replace(/[%_\\]/g, ' ')}%`)
  } else if (q) {
    // If query looks like a number, also search by id_number and phone
    const numericQ = /^\d+$/.test(q)
    if (numericQ) {
      const padded = q.padStart(9, '0')
      const unpadded = q.replace(/^0+/, '') || q
      query = query.or([
        `id_number.eq.${q}`,`id_number.eq.${padded}`,`id_number.eq.${unpadded}`,
        `spouse_id_number.eq.${q}`,`spouse_id_number.eq.${padded}`,`spouse_id_number.eq.${unpadded}`,
        `phone.ilike.%${q}%`,`phone2.ilike.%${q}%`,
      ].join(','))
    } else {
      // ניטרול תווים שמורים של מסנן .or() ושל תבנית ilike (מניעת filter injection)
      const safe = q.replace(/[,()*%_\\"']/g, ' ').trim()
      query = query.or(`full_name.ilike.%${safe}%,family_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`)
    }
  }

  const { data } = await query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = (data ?? []).map((b: any) => ({
    ...b,
    name: [b.family_name, b.full_name].filter(Boolean).join(' '),
  }))

  return NextResponse.json({ results })
}
