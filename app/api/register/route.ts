import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { sendEmail, templateRegistrationConfirmed } from '@/lib/email'
import { mailFor } from '@/lib/departments'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { validateIsraeliId } from '@/lib/validation'
import { attachOrphanMailToBeneficiary } from '@/lib/legacyMailSync'

function verifyNonce(nonce: string, email: string): boolean {
  try {
    const secret = process.env.OTP_NONCE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
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
  // הגבלת קצב — מניעת רישומי ספאם
  if (!rateLimit(`register:${clientIp(request)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות רישום. נסה שוב מאוחר יותר.' }, { status: 429 })
  }

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

  // Sanitize ID number (digits only) + אימות ספרת ביקורת (אלא אם דרכון)
  const cleanId = String(id_number).replace(/\D/g, '')
  const isPassport = String((body as Record<string, unknown>).id_doc_type ?? 'id') === 'passport'
  if (isPassport) {
    if (String(id_number).trim().length < 5) return NextResponse.json({ error: 'מספר דרכון לא תקין' }, { status: 400 })
  } else if (!validateIsraeliId(cleanId)) {
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

  const cleanEmail = String(email).toLowerCase().trim()
  const cleanSpouseId = spouse_id_number ? String(spouse_id_number).replace(/\D/g, '') : null
  const { data: insertedBen, error } = await adminClient.from('beneficiaries').insert({
    id_number: cleanId,
    full_name: String(full_name).trim(),
    phone: String(phone).trim(),
    phone2: phone2 ? String(phone2).trim() : null,
    email: cleanEmail,
    address: address ? String(address).trim() : null,
    city: city ? String(city).trim() : null,
    birth_date: birth_date || null,
    gender: gender || null,
    marital_status: marital_status ? String(marital_status) : null,
    children_count: typeof children_count === 'number' ? children_count : parseInt(String(children_count || '0'), 10),
    notes: notes ? String(notes).trim() : null,
    lineage_node_id: lineage_node_id ? String(lineage_node_id) : null,
    spouse_name: spouse_name ? String(spouse_name).trim() : null,
    spouse_id_number: cleanSpouseId,
    eligibility_status: 'pending',
    is_active: true,
  }).select('id').single()

  if (error) {
    console.error('Registration error:', error.message)
    if (error.code === '23505') {
      return NextResponse.json({ error: 'פרטים אלו כבר קיימים במערכת' }, { status: 409 })
    }
    return NextResponse.json({ error: 'שגיאה בשמירת הנתונים. אנא נסה שוב.' }, { status: 500 })
  }

  // שיוך למפרע: מיילים ישנים של הנרשם שכבר במערכת אך ללא שיוך — לקשר אליו כעת (לא חוסם).
  if (insertedBen?.id) {
    attachOrphanMailToBeneficiary(adminClient, {
      id: insertedBen.id, email: cleanEmail, id_number: cleanId, spouse_id_number: cleanSpouseId,
    }).catch(e => console.error('[register] attach orphan mail failed:', e))
  }

  // Send confirmation email (non-blocking)
  sendEmail({ ...templateRegistrationConfirmed(String(full_name).trim()), to: cleanEmail }, mailFor('igud'))
    .catch(e => console.error('[register] confirmation email failed:', e))

  return NextResponse.json({ ok: true })
}
