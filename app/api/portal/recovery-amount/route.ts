import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { portalCookieName } from '../login/route'
import { verifyRecoveryPortalToken } from '@/lib/recoveryPortalAuth'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// בית ההחלמה מזין את הסכום שמומש עבור הלידה ושולח לאישור. רק כשסומן "הגיעה".
export async function POST(request: NextRequest) {
  const { home, aidId, amount, nights, receiptNumber } = await request.json()
  if (!home || !aidId) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt < 0) return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  const nightsNum = nights === '' || nights == null ? null : Number(nights)
  if (nightsNum != null && (!Number.isInteger(nightsNum) || nightsNum < 0)) {
    return NextResponse.json({ error: 'מספר לילות לא תקין' }, { status: 400 })
  }
  const receipt = typeof receiptNumber === 'string' ? receiptNumber.trim() : ''
  if (!receipt) return NextResponse.json({ error: 'יש להזין מספר קבלה' }, { status: 400 })

  const cookieStore = await cookies()
  if (!verifyRecoveryPortalToken(cookieStore.get(portalCookieName(home))?.value, home)) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // אבטחה: הרשומה שייכת לבית ההחלמה הזה, וסומן שהיולדת הגיעה
  const { data: aid } = await admin.from('maternity_aids').select('id, recovery_home, recovery_arrived').eq('id', aidId).maybeSingle()
  if (!aid || aid.recovery_home !== home) {
    return NextResponse.json({ error: 'הרשומה לא נמצאה בבית החלמה זה' }, { status: 404 })
  }
  if (aid.recovery_arrived !== true) {
    return NextResponse.json({ error: 'יש לסמן "הגיעה" לפני הזנת הסכום' }, { status: 400 })
  }

  const { error } = await admin.from('maternity_aids').update({
    recovery_amount: amt,
    recovery_nights: nightsNum,
    recovery_receipt_number: receipt,
    recovery_amount_status: 'executed', // בית ההחלמה מסמן ביצוע — אין צורך באישור נוסף
    recovery_amount_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', aidId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
