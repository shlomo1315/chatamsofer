import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getRegistrationGate, registrationAllowed } from '@/lib/registrationGate'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// סטטוס ההרשמה הציבורית לפורטל. open=true אם פתוח לכולם, או אם הוצג קוד עוקף תקין (?signup=CODE).
export async function GET(request: NextRequest) {
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ open: true }) // סביבת פיתוח ללא שרת — לא חוסמים
  const gate = await getRegistrationGate(admin)
  const code = new URL(request.url).searchParams.get('signup')
  const open = registrationAllowed(gate, code)
  return NextResponse.json({ open }, { headers: { 'Cache-Control': 'no-store' } })
}
