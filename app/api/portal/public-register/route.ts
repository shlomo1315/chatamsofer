import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { registrationReceivedEmail } from '@/lib/emailTemplates'
import { deliverMail } from '@/lib/sendMail'

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
    spouse_name, spouse_id_number, spouse_phone, children, children_count, notes, lineage_node_id, lineage_manual, lineage_chain,
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
    lineage_manual: Array.isArray(lineage_manual) && lineage_manual.length > 0 ? lineage_manual : null,
    lineage_chain: Array.isArray(lineage_chain) && lineage_chain.length > 0 ? lineage_chain : null,
    eligibility_status: 'pending',
    is_active: true,
  }

  // נשואים = משפחה אחת = כרטסת אחת. הבעל והאשה נשמרים על אותה רשומה
  // (full_name + spouse_name), ולא כשתי רשומות נפרדות.
  const records: Record<string, unknown>[] = [{
    id_number: cleanId,
    full_name: String(full_name).trim(),
    family_name: String(family_name).trim(),
    birth_date: birth_date || null,
    gender: isMarried ? 'male' : (gender || null),
    spouse_name: spouse_name ? String(spouse_name).trim() : null,
    spouse_id_number: spouse_id_number ? String(spouse_id_number).replace(/\D/g, '') : null,
    spouse_phone: spouse_phone ? String(spouse_phone).trim() : null,
    ...sharedFields,
  }]

  let { error } = await admin.from('beneficiaries').insert(records)

  // Retry without optional columns that may not exist in DB yet (pending migrations)
  if (error && error.message?.includes('column') && error.message?.includes('does not exist')) {
    console.error('[public-register] column missing, retrying without optional fields:', error.message)
    const stripped = records.map(r => {
      const { spouse_phone, children, lineage_manual, lineage_chain, ...rest } = r as Record<string, unknown>
      void spouse_phone; void children; void lineage_manual; void lineage_chain
      return rest
    })
    const retry = await admin.from('beneficiaries').insert(stripped)
    error = retry.error
  }

  if (error) {
    console.error('[public-register] insert error:', error.code, error.message, error.details)
    if (error.code === '23505') return NextResponse.json({ error: 'פרטים אלו כבר קיימים במערכת' }, { status: 409 })
    return NextResponse.json({ error: 'שגיאה בשמירת הנתונים. אנא נסה שוב.' }, { status: 500 })
  }

  // Send confirmation email (non-blocking) — מעוצב עם כל פרטי הרישום + קישור לפורטל
  if (email) {
    const reg = registrationReceivedEmail({
      full_name: full_name ? String(full_name) : null,
      family_name: family_name ? String(family_name) : null,
      id_number: id_number ? String(id_number) : null,
      phone: phone ? String(phone) : null,
      email: String(email),
      address: address ? String(address) : null,
      city: city ? String(city) : null,
      marital_status: marital_status ? String(marital_status) : null,
      spouse_name: spouse_name ? String(spouse_name) : null,
      spouse_id_number: spouse_id_number ? String(spouse_id_number) : null,
      children_count: cleanChildCount,
    })
    deliverMail(String(email), reg.subject, reg.html)
      .catch(e => console.error('[public-register] confirmation email failed:', e))
  }

  return NextResponse.json({ ok: true })
}
