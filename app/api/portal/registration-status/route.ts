import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getRegistrationGate, registrationAllowed, DEFAULT_CLOSED_MESSAGE } from '@/lib/registrationGate'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// סטטוס ההרשמה הציבורית לפורטל. open=true אם פתוח לכולם, או אם הוצג קוד עוקף תקין (?signup=CODE).
// כשסגור מוחזרת גם סיבת הסגירה שהוזנה בהגדרות, להצגה במקום הנוסח הקבוע.
export async function GET(request: NextRequest) {
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ open: true }) // סביבת פיתוח ללא שרת — לא חוסמים
  const gate = await getRegistrationGate(admin)
  const code = new URL(request.url).searchParams.get('signup')
  const open = registrationAllowed(gate, code)
  return NextResponse.json(
    {
      open,
      // הטופס צריך לדעת אם לחסום סיום רישום בלי אימות מייל. השרת הוא האוכף
      // (public-register בודק את אותו מתג) — כאן רק כדי שה-UI יתאים לו.
      emailVerificationRequired: gate.emailVerificationRequired,
      ...(open ? {} : { closedMessage: gate.closedMessage || DEFAULT_CLOSED_MESSAGE }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
