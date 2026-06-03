import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const {
    id_number, full_name, family_name, phone, phone2, email,
    address, city, birth_date, gender, marital_status,
    spouse_name, spouse_id_number, children, children_count, notes, lineage_node_id,
  } = body

  if (!id_number || !full_name || !family_name || !phone) {
    return NextResponse.json({ error: 'שדות חובה חסרים' }, { status: 400 })
  }

  const cleanId = String(id_number).replace(/\D/g, '')
  if (cleanId.length < 5 || cleanId.length > 9) {
    return NextResponse.json({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: existing } = await admin.from('beneficiaries').select('id').eq('id_number', cleanId).maybeSingle()
  if (existing) return NextResponse.json({ error: 'תעודת זהות זו כבר רשומה במערכת' }, { status: 409 })

  const isMarried = String(marital_status) === 'נשואים'
  const cleanChildCount = Array.isArray(children) ? children.length : (typeof children_count === 'number' ? children_count : parseInt(String(children_count || '0'), 10))
  const childrenJson = Array.isArray(children) && children.length > 0 ? children : null
  const sharedFields = {
    phone: String(phone).trim(),
    phone2: phone2 ? String(phone2).trim() : null,
    email: email ? String(email).toLowerCase().trim() : null,
    address: address ? String(address).trim() : null,
    city: city ? String(city).trim() : null,
    marital_status: marital_status ? String(marital_status) : null,
    children_count: cleanChildCount,
    children: childrenJson,
    notes: notes ? String(notes).trim() : null,
    lineage_node_id: lineage_node_id ? String(lineage_node_id) : null,
    eligibility_status: 'pending',
    is_active: true,
  }

  const records: Record<string, unknown>[] = [{
    id_number: cleanId,
    full_name: String(full_name).trim(),
    family_name: String(family_name).trim(),
    birth_date: birth_date || null,
    gender: isMarried ? 'male' : (gender || null),
    spouse_name: spouse_name ? String(spouse_name).trim() : null,
    spouse_id_number: spouse_id_number ? String(spouse_id_number).replace(/\D/g, '') : null,
    ...sharedFields,
  }]

  // For נשואים: also insert spouse as a separate beneficiary record
  if (isMarried && spouse_name && spouse_id_number) {
    const cleanSpouseId = String(spouse_id_number).replace(/\D/g, '')
    if (cleanSpouseId.length >= 5) {
      const { data: existingSpouse } = await admin.from('beneficiaries').select('id').eq('id_number', cleanSpouseId).maybeSingle()
      if (!existingSpouse) {
        const spouseParts = String(spouse_name).trim().split(' ')
        records.push({
          id_number: cleanSpouseId,
          full_name: spouseParts[0] ?? String(spouse_name).trim(),
          family_name: spouseParts.slice(1).join(' ') || String(family_name ?? '').trim(),
          birth_date: null,
          gender: 'female',
          spouse_name: String(full_name).trim(),
          spouse_id_number: cleanId,
          ...sharedFields,
        })
      }
    }
  }

  const { error } = await admin.from('beneficiaries').insert(records)
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'פרטים אלו כבר קיימים במערכת' }, { status: 409 })
    return NextResponse.json({ error: 'שגיאה בשמירת הנתונים. אנא נסה שוב.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
