import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken, DIST_PORTAL_COOKIE } from '@/lib/distributionsPortalAuth'
import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetchAllRows'

// ─────────────────────────────────────────────────────────────────────────────
// דף שיתוף חלוקות חגים — API לתצוגה בלבד (view-only).
//
// מחזיר את *כל* החלוקות ואת *כל* הנרשמים בהן, עם אותם שדות שמסך הניהול מציג.
// אין כאן שום כתיבה — הדף המשותף הוא קריאה בלבד. אימות דרך cookie הסיסמה בלבד.
// ─────────────────────────────────────────────────────────────────────────────

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(DIST_PORTAL_COOKIE)?.value
  if (!(await verifyPortalToken(token))) {
    return NextResponse.json({ error: 'נדרשת אימות' }, { status: 401 })
  }

  const admin = adminClient()

  const { data: distributions, error: distErr } = await admin
    .from('distributions')
    .select('id, name, year, holiday, description, status, registration_open, amount_per_family, total_budget, distribution_date, created_at')
    .order('created_at', { ascending: false })
    .limit(10000)
  if (distErr) return NextResponse.json({ error: distErr.message }, { status: 500 })

  // ⚠️ שליפה בדפים ולא ב-limit: התקרה נאכפת בצד השרת (db-max-rows) ואינה
  // ניתנת לעקיפה מהלקוח — .limit(100000) נוסה ולא עזר, הרשימה נחתכה ב-1,000
  // בלי שגיאה. ראו lib/fetchAllRows.
  const ids = (distributions ?? []).map(d => d.id)
  let recipients: unknown[] = []
  if (ids.length) {
    const { rows, error: recErr } = await fetchAllRows<unknown>((from, to) => admin
      .from('distribution_recipients')
      .select('id, distribution_id, source, registered_at, phone, notified_at, amount, beneficiary_id, approval_status, approved_at, card_number, card_linked_at, beneficiary:beneficiaries(id, full_name, family_name, spouse_name, id_number, phone, phone2, email, address, city, community_affiliation, children_count, birth_date, spouse_birth_date, lineage_node_id)')
      .in('distribution_id', ids)
      .order('registered_at', { ascending: false })
      .range(from, to))
    if (recErr) return NextResponse.json({ error: recErr }, { status: 500 })
    recipients = rows
  }

  // עץ הדורות — לעץ הוויזואלי בדף השיתוף. קל-משקל, מרונדר בצד הלקוח.
  const { rows: lineageNodes } = await fetchAllRows<unknown>((from, to) => admin
    .from('lineage_nodes')
    .select('id, name, parent_id, generation, status')
    .order('id')
    .range(from, to))

  // סה"כ צאצאים רשומים במערכת (לקוביית הסיכום בדשבורד) — ספירה בלבד, ללא נתונים.
  const { count: beneficiariesCount } = await admin
    .from('beneficiaries')
    .select('id', { count: 'exact', head: true })

  // ── יולדות — לטאב הייעודי בדף השיתוף ──
  // ⚠️ תצוגה בלבד. הדף מוגן בסיסמה ומבודד משאר האתר, ולכן הנתונים נשלפים
  // כאן במלואם ולא נחשפים בשום נתיב ציבורי אחר.
  const { rows: maternityRows } = await fetchAllRows<Record<string, unknown>>((from, to) => admin
    .from('maternity_aids')
    .select('id, birth_date, baby_name, baby_gender, recovery_home, recovery_arrived, recovery_arrived_at, recovery_nights, recovery_amount, card_number, card_voucher_status, status, created_at, beneficiary:beneficiaries(full_name, family_name, spouse_name, id_number, phone, city)')
    .order('created_at', { ascending: false })
    .range(from, to))

  // ספירת קבלות לכל בקשה — מה שקובע "חויבה".
  // 🔴 recovery_receipt_url לבדו אינו מספיק: מאז המעבר לקבלות מרובות הוא
  // מחזיק רק את הראשונה, ובקשה עם קבלה משלימה בלבד הייתה נספרת כלא-מחויבת.
  const { rows: receipts } = await fetchAllRows<{ aid_id: string; amount?: number | null }>((from, to) => admin
    .from('recovery_receipts').select('aid_id, amount').range(from, to))
  const recByAid = new Map<string, { count: number; amount: number }>()
  for (const r of receipts) {
    const cur = recByAid.get(r.aid_id) ?? { count: 0, amount: 0 }
    cur.count++
    cur.amount += Number(r.amount ?? 0) || 0
    recByAid.set(r.aid_id, cur)
  }

  const maternity = maternityRows.map(a => {
    const id = String(a.id ?? '')
    const rec = recByAid.get(id) ?? { count: 0, amount: 0 }
    return {
      ...a,
      receiptCount: rec.count,
      // ⚠️ הסכום מהקבלות גובר: הוא המצטבר האמיתי, והשדה הישן מחזיק רק
      // את ההגשה הראשונה.
      recovery_amount: rec.count > 0 ? rec.amount : (Number(a.recovery_amount ?? 0) || 0),
    }
  })

  return NextResponse.json(
    {
      distributions: distributions ?? [],
      recipients,
      lineageNodes,
      beneficiariesCount: beneficiariesCount ?? 0,
      maternity,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
