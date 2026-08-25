import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getNedarimCreds, getClientCard } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// יתרות אמיתיות מנדרים — כמה כסף נשאר, וכמה כבר מומש.
//
// 🔴 card_balance במסד נכתב פעם אחת בטעינה ואינו מתעדכן מקניות.
// כל היולדות רשומות 600.00 גם אחרי שקנו — כולל מי שנשארו לה 0.21.
// המספר נראה מדויק והוא שקר.
//
// ⚠️ נדרים היא מקור האמת היחיד ליתרה. אין דרך לגזור אותה מהמסד.
//
// ⚠️ נשלף על פי דרישה ולא בטעינת המסך: קריאה אחת לכל משפחה, ו-200
// יולדות טעונות פירושן 200 פניות ל-API חיצוני. המזכירה מבקשת את זה
// כשהיא צריכה, ורואה כמה זמן זה לוקח.
//
// 🔒 מנהל בלבד — זה מידע כספי.
// ─────────────────────────────────────────────────────────────────────────────

/** השהיה קצרה בין קריאות. */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function GET(request: NextRequest) {
  const staff = await requireStaff(['admin'])
  if (!staff) return forbidden('היתרות שמורות למנהל')

  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'חיבור נדרים פלוס לא מוגדר' }, { status: 500 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ אפשר לבקש משפחה אחת (רענון נקודתי) או את כל הטעונות.
  const oneId = request.nextUrl.searchParams.get('aid_id')

  let query = db.from('maternity_aids')
    .select('id, card_load_amount, beneficiary:beneficiaries(nedarim_id)')
    .eq('card_load_status', 'loaded')
    .is('card_unloaded_at', null)
  if (oneId) query = query.eq('id', oneId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as {
    id: string; card_load_amount?: number | string | null
    beneficiary?: { nedarim_id?: string | null } | { nedarim_id?: string | null }[] | null
  }[]

  // ⚠️ מטמון לפי מזהה משפחה: לאותה משפחה עשויים להיות כמה תיקים,
  // וקריאה חוזרת הייתה מכפילה את הפניות ל-API החיצוני.
  const cache = new Map<string, number | null>()
  const balances: Record<string, { balance: number | null; loaded: number | null; spent: number | null }> = {}
  let failed = 0

  for (const r of rows) {
    const b = Array.isArray(r.beneficiary) ? r.beneficiary[0] : r.beneficiary
    const nedId = (b?.nedarim_id ?? '').toString().trim()
    const loaded = r.card_load_amount != null ? Number(r.card_load_amount) : null

    if (!nedId) {
      balances[r.id] = { balance: null, loaded, spent: null }
      continue
    }

    let balance: number | null
    if (cache.has(nedId)) {
      balance = cache.get(nedId) ?? null
    } else {
      try {
        const card = await getClientCard(creds, nedId)
        balance = card?.totalFreeAmount ?? null
      } catch {
        // ⚠️ null ולא 0: "לא ידוע" ו"נוצל במלואו" הם דברים שונים,
        // והצגת 0 הייתה אומרת למזכירה שהמשפחה בזבזה הכל.
        balance = null
      }
      cache.set(nedId, balance)
      // ⚠️ השהיה בין קריאות: חמש פניות בשנייה החזירו תשובות ריקות
      // בפריקה של 25.08.
      await sleep(120)
    }

    if (balance == null) failed++
    balances[r.id] = {
      balance,
      loaded,
      // 🔴 המימוש = מה שנטען פחות מה שנשאר. זה מה שהמזכירה שואלת.
      spent: balance != null && loaded != null ? Math.max(0, loaded - balance) : null,
    }
  }

  return NextResponse.json({
    balances,
    checked: rows.length,
    failed,
    at: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
