import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { portalCookieName } from '../login/route'
import { verifyRecoveryPortalToken } from '@/lib/recoveryPortalAuth'
import { isWithinRecoveryWindow } from '@/lib/maternity'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const home = request.nextUrl.searchParams.get('home')
  if (!home) return NextResponse.json({ error: 'חסר שם בית החלמה' }, { status: 400 })

  // Verify portal cookie
  const cookieStore = await cookies()
  const isAuthed = verifyRecoveryPortalToken(cookieStore.get(portalCookieName(home))?.value, home)
  if (!isAuthed) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await admin
    .from('maternity_aids')
    .select(`
      id, birth_date, baby_name, baby_gender, six_weeks_end,
      is_twins, babies, recovery_eligibility_days,
      recovery_from, recovery_to, card_number, recovery_arrived,
      recovery_amount, recovery_amount_status, recovery_nights, recovery_receipt_number,
      recovery_stay_from, recovery_stay_to,
      recovery_receipt_url, recovery_locked, recovery_edit_requested_at, recovery_topup_at,
      beneficiary:beneficiaries(
        id, full_name, family_name, spouse_name, spouse_id_number, phone, address, city
      )
    `)
    .eq('status', 'active')
    .eq('recovery_home', home)
    .order('birth_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // פורטל בית ההחלמה — חלון הזכאות כאן הוא 5 שבועות (35 יום), לא 6.
  // 6 שבועות הוא תוקף כרטיס המזון, וזה חלון אחר. הארכה ידנית נגררת לשניהם.
  //
  // ⚠️ רשומה שכבר הוגשה (executed) נשארת נגישה גם אחרי שהחלון נסגר, בטאב
  // "טופלו". הסיבה: טעות בחיוב מתגלה לעיתים שבועות אחרי השהייה (יולדת שהאריכה
  // לילה והתשלום נגבה חסר), ועד כה הרשומה נעלמה מהפורטל ולבית ההחלמה לא הייתה
  // שום דרך להשלים את ההפרש. החלון עדיין חוסם *הגשה ראשונה* מאוחרת.
  const filtered = (data ?? []).filter((a: {
    birth_date: string; six_weeks_end?: string; recovery_amount_status?: string | null
  }) => a.recovery_amount_status === 'executed' || isWithinRecoveryWindow(a))

  // קבלות מרובות (תשלומים משלימים) — נשלפות בשאילתה אחת לכל הרשומות.
  const ids = filtered.map((a: { id: string }) => a.id)
  let receiptsByAid: Record<string, unknown[]> = {}
  if (ids.length) {
    const { data: rec } = await admin.from('recovery_receipts')
      .select('id, aid_id, url, amount, nights, note, is_initial, created_at')
      .in('aid_id', ids).order('created_at')
    receiptsByAid = (rec ?? []).reduce((m: Record<string, unknown[]>, r: { aid_id: string }) => {
      (m[r.aid_id] ||= []).push(r); return m
    }, {})
  }
  const withReceipts = filtered.map((a: { id: string }) => ({
    ...a, receipts: receiptsByAid[a.id] ?? [],
  }))

  return NextResponse.json({ aids: withReceipts })
}
