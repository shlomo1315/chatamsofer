import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { sendEmail, templateRegistrationConfirmed } from '@/lib/email'

function verifyNonce(nonce: string, email: string): boolean {
  try {
    const secret = process.env.OTP_NONCE_SECRET || 'change-this-secret-in-production'
    const decoded = Buffer.from(nonce, 'base64url').toString()
    const lastColon = decoded.lastIndexOf(':')
    const payload = decoded.slice(0, lastColon)
    const sig = decoded.slice(lastColon + 1)
    const [storedEmail, expStr] = payload.split(':')
    const exp = parseInt(expStr, 10)

    if (storedEmail !== email) return false
    if (isNaN(exp) || exp < Date.now()) return false

    const expectedSig = createHmac('sha256', secret).update(payload).digest('hex')
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const {
    nonce,
    email,
    id_number,
    full_name,
    phone,
    phone2,
    address,
    city,
    birth_date,
    gender,
    marital_status,
    children_count,
    notes,
    lineage_node_id,
    spouse_name,
    spouse_id_number,
  } = body as Record<string, string | number | undefined>

  // Validate nonce
  if (!nonce || !email || !verifyNonce(String(nonce), String(email))) {
    return NextResponse.json({ error: 'פג תוקף האימות. אנא התחל מחדש.' }, { status: 401 })
  }

  // Validate required fields
  if (!id_number || !full_name || !phone) {
    return NextResponse.json({ error: 'שדות חובה חסרים' }, { status: 400 })
  }

  // Sanitize ID number (digits only)
  const cleanId = String(id_number).replace(/\D/g, '')
  if (cleanId.length < 5 || cleanId.length > 9) {
    return NextResponse.json({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check uniqueness by ID number
  const { data: existingById } = await adminClient
    .from('beneficiaries')
    .select('id')
    .eq('id_number', cleanId)
    .maybeSingle()

  if (existingById) {
    return NextResponse.json({ error: 'תעודת זהות זו כבר רשומה במערכת' }, { status: 409 })
  }

  // Check uniqueness by email
  const { data: existingByEmail } = await adminClient
    .from('beneficiaries')
    .select('id')
    .eq('email', String(email))
    .maybeSingle()

  if (existingByEmail) {
    return NextResponse.json({ error: 'כתובת אימייל זו כבר רשומה במערכת' }, { status: 409 })
  }

  const { error } = await adminClient.from('beneficiaries').insert({
    id_number: cleanId,
    full_name: String(full_name).trim(),
    phone: String(phone).trim(),
    phone2: phone2 ? String(phone2).trim() : null,
    email: String(email).toLowerCase().trim(),
    address: address ? String(address).trim() : null,
    city: city ? String(city).trim() : null,
    birth_date: birth_date || null,
    gender: gender || null,
    marital_status: marital_status ? String(marital_status) : null,
    children_count: typeof children_count === 'number' ? children_count : parseInt(String(children_count || '0'), 10),
    notes: notes ? String(notes).trim() : null,
    lineage_node_id: lineage_node_id ? String(lineage_node_id) : null,
    spouse_name: spouse_name ? String(spouse_name).trim() : null,
    spouse_id_number: spouse_id_number ? String(spouse_id_number).replace(/\D/g, '') : null,
    eligibility_status: 'pending',
    is_active: true,
  })

  if (error) {
    console.error('Registration error:', error.message)
    if (error.code === '23505') {
      return NextResponse.json({ error: 'פרטים אלו כבר קיימים במערכת' }, { status: 409 })
    }
    return NextResponse.json({ error: 'שגיאה בשמירת הנתונים. אנא נסה שוב.' }, { status: 500 })
  }

  // Send confirmation email (non-blocking)
  sendEmail({ ...templateRegistrationConfirmed(String(full_name).trim()), to: String(email).toLowerCase().trim() })
    .catch(e => console.error('[register] confirmation email failed:', e))

  return NextResponse.json({ ok: true })
}
