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

// צוות בית ההחלמה מסמן האם היולדת הגיעה. מאומת דרך עוגיית הפורטל של אותו בית החלמה.
export async function POST(request: NextRequest) {
  const { home, aidId, arrived } = await request.json()
  if (!home || !aidId) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  if (arrived !== true && arrived !== false && arrived !== null) {
    return NextResponse.json({ error: 'ערך לא תקין' }, { status: 400 })
  }

  const cookieStore = await cookies()
  if (!verifyRecoveryPortalToken(cookieStore.get(portalCookieName(home))?.value, home)) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // לוודא שהרשומה אכן שייכת לאותו בית החלמה (אבטחה)
  const { data: aid } = await admin.from('maternity_aids').select('id, recovery_home').eq('id', aidId).maybeSingle()
  if (!aid || aid.recovery_home !== home) {
    return NextResponse.json({ error: 'הרשומה לא נמצאה בבית החלמה זה' }, { status: 404 })
  }

  const { error } = await admin.from('maternity_aids').update({
    recovery_arrived: arrived,
    recovery_arrived_at: arrived === null ? null : new Date().toISOString(),
    recovery_arrived_by: arrived === null ? null : home,
    updated_at: new Date().toISOString(),
  }).eq('id', aidId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // תזמון בקשת משוב על בית ההחלמה — 5 ימים אחרי סימון ההגעה.
  // ביטול הסימון מבטל גם את המייל הממתין (אם טרם נשלח).
  // ברקע — הפורטל של בית ההחלמה חייב להמשיך לעבוד גם אם התזמון נכשל.
  void (async () => {
    try {
      const { scheduleEmail, cancelScheduledEmail } = await import('@/lib/scheduledMail')
      const key = { kind: 'recovery_survey' as const, entityTable: 'maternity_aids', entityId: aidId }

      if (arrived === true) {
        const { addDays } = await import('@/lib/jewishCalendar')
        const { data: full } = await admin
          .from('maternity_aids')
          .select('beneficiary:beneficiaries(email)')
          .eq('id', aidId)
          .maybeSingle()
        const ben = (Array.isArray(full?.beneficiary) ? full?.beneficiary[0] : full?.beneficiary) as
          { email?: string | null } | null
        await scheduleEmail({
          ...key,
          toEmail: ben?.email,
          sendAfter: addDays(new Date(), 5),
          payload: { recovery_home: home },
        })
      } else {
        await cancelScheduledEmail(key)
      }
    } catch (err) {
      console.error('[arrived] תזמון משוב נכשל', err)
    }
  })()

  return NextResponse.json({ ok: true })
}
