import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const NEDARIM_URL = 'https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// מוודא שמי שמבצע מחובר (משתמש מערכת)
async function verifyStaff() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return !!user
}

export async function POST(request: NextRequest) {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }

  const mosadId = process.env.NEDARIM_MOSAD_ID
  const apiPassword = process.env.NEDARIM_API_PASSWORD
  if (!mosadId || !apiPassword) {
    return NextResponse.json({ error: 'חיבור נדרים פלוס לא מוגדר (NEDARIM_MOSAD_ID / NEDARIM_API_PASSWORD)' }, { status: 500 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  let body: { beneficiaryId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.beneficiaryId) return NextResponse.json({ error: 'חסר מזהה צאצא' }, { status: 400 })

  // שליפת פרטי המשפחה
  const { data: b, error: bErr } = await admin
    .from('beneficiaries')
    .select('id, full_name, family_name, id_number, address, city, phone, phone2, email, nedarim_id')
    .eq('id', body.beneficiaryId)
    .maybeSingle()
  if (bErr || !b) return NextResponse.json({ error: 'הצאצא לא נמצא' }, { status: 404 })

  // בניית גוף הבקשה לנדרים פלוס — Action=SaveClientCard
  const form = new URLSearchParams()
  form.set('Action', 'SaveClientCard')
  form.set('MosadId', mosadId)
  form.set('ApiPassword', apiPassword)
  if (b.nedarim_id) form.set('ClientId', String(b.nedarim_id)) // עדכון משפחה קיימת
  form.set('FamilyName', b.family_name || b.full_name || '')
  form.set('FirstName', b.full_name || '')
  if (b.id_number) form.set('Zeout', String(b.id_number))
  if (b.address || b.city) form.set('Address', [b.address, b.city].filter(Boolean).join(', '))
  if (b.phone) form.set('Phone1', String(b.phone))
  if (b.phone2) form.set('Phone2', String(b.phone2))
  if (b.email) form.set('Email', String(b.email))
  form.set('Comments', 'נוצר/עודכן אוטומטית ממערכת היכל החתם סופר')

  let responseText = ''
  try {
    const res = await fetch(NEDARIM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    responseText = await res.text()
    if (!res.ok) {
      return NextResponse.json({ error: `נדרים החזיר שגיאה (${res.status})`, raw: responseText.slice(0, 500) }, { status: 502 })
    }
  } catch (e) {
    return NextResponse.json({ error: `כשל בחיבור לנדרים פלוס: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 })
  }

  // ניסיון לחלץ את מזהה המשפחה (ClientId) מהתגובה ולשמור אותו
  let clientId: string | null = null
  try {
    const json = JSON.parse(responseText)
    clientId = json.ClientId ?? json.clientId ?? json.Id ?? null
  } catch {
    const m = responseText.match(/ClientId["'\s:=>]+(\d+)/i)
    if (m) clientId = m[1]
  }
  if (clientId && clientId !== b.nedarim_id) {
    await admin.from('beneficiaries').update({ nedarim_id: String(clientId) }).eq('id', b.id)
  }

  return NextResponse.json({ ok: true, clientId, raw: responseText.slice(0, 500) })
}
