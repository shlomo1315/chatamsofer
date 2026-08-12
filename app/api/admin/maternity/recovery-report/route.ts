import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { recoveryState, groupByHome, totalsOf, RECOVERY_LABEL } from '@/lib/recoveryStatus'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// דוח מימוש בתי החלמה.
//
// 🔴 השאלה שהדוח עונה עליה: "כמה יולדות כבר מימשו בית החלמה, וכמה עוד לא" —
// בפילוח לפי בית החלמה.
//
// ⚠️ הייצוא הרגיל מחזיר עמודת status של הבקשה, והיא אינה עונה על זה: בקשה
// יכולה להיות 'active' גם לפני שהיולדת הגיעה וגם אחרי שיצאה. לכן כאן נגזר
// מצב מפורש משני צירים — הגעה בפועל, וקבלה מבית ההחלמה.
// ─────────────────────────────────────────────────────────────────────────────

interface AidRow {
  id: string
  birth_date?: string | null
  baby_name?: string | null
  recovery_home?: string | null
  recovery_arrived?: boolean | null
  recovery_arrived_at?: string | null
  recovery_nights?: number | null
  recovery_amount?: number | null
  recovery_receipt_url?: string | null
  status?: string | null
  created_at?: string | null
  beneficiary?: {
    full_name?: string | null
    family_name?: string | null
    spouse_name?: string | null
    id_number?: string | null
    phone?: string | null
    city?: string | null
  } | null
}

export async function GET() {
  const staff = await requirePermission('maternity', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ בדפים: תקרת השורות של PostgREST אינה ניתנת לעקיפה ב-limit, והרשימה
  // הייתה נחתכת בשקט. ראו lib/fetchAllRows.
  const { rows: rawRows, error } = await fetchAllRows<Record<string, unknown>>((from, to) => db
    .from('maternity_aids')
    .select('id, birth_date, baby_name, recovery_home, recovery_arrived, recovery_arrived_at, recovery_nights, recovery_amount, recovery_receipt_url, status, created_at, beneficiary:beneficiaries(full_name, family_name, spouse_name, id_number, phone, city)')
    .not('recovery_home', 'is', null)
    .order('created_at', { ascending: false })
    .range(from, to))
  const rows = rawRows as unknown as AidRow[]

  if (error) {
    console.error('[recovery-report] שליפה נכשלה:', error)
    return NextResponse.json({ error: 'שליפת הנתונים נכשלה' }, { status: 500 })
  }

  // ── ספירת קבלות לכל בקשה ──
  // 🔴 הקבלה היא מה שקובע "חויבה". recovery_receipt_url לבדו אינו מספיק:
  // מאז המעבר לקבלות מרובות הוא מחזיק רק את הראשונה, ובקשה עם קבלה משלימה
  // בלבד הייתה נספרת כלא-מחויבת.
  const { rows: receiptRows } = await fetchAllRows<{ aid_id: string; amount?: number | null }>((from, to) => db
    .from('recovery_receipts').select('aid_id, amount').range(from, to))

  const byAid = new Map<string, { count: number; amount: number }>()
  for (const r of receiptRows) {
    const cur = byAid.get(r.aid_id) ?? { count: 0, amount: 0 }
    cur.count++
    cur.amount += Number(r.amount ?? 0) || 0
    byAid.set(r.aid_id, cur)
  }

  const enriched = rows.map(a => {
    const rec = byAid.get(a.id) ?? { count: 0, amount: 0 }
    // ⚠️ סכום מהקבלות גובר על recovery_amount: הוא הסכום המצטבר האמיתי,
    // והשדה הישן מחזיק רק את ההגשה הראשונה.
    const amount = rec.count > 0 ? rec.amount : (Number(a.recovery_amount ?? 0) || 0)
    const state = recoveryState({
      recovery_home: a.recovery_home,
      recovery_arrived: a.recovery_arrived,
      receiptCount: rec.count,
      recovery_amount: amount,
    })
    const b = a.beneficiary
    return {
      id: a.id,
      state,
      stateLabel: RECOVERY_LABEL[state],
      name: [b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || (b?.full_name ?? '—'),
      id_number: b?.id_number ?? null,
      phone: b?.phone ?? null,
      city: b?.city ?? null,
      birth_date: a.birth_date ?? null,
      baby_name: a.baby_name ?? null,
      recovery_home: a.recovery_home ?? null,
      arrived: a.recovery_arrived === true,
      arrived_at: a.recovery_arrived_at ?? null,
      nights: a.recovery_nights ?? null,
      amount,
      receiptCount: rec.count,
      status: a.status ?? null,
      created_at: a.created_at ?? null,
    }
  })

  // פילוח לפי בית החלמה + סיכום כולל.
  const forStats = enriched.map(e => ({
    recovery_home: e.recovery_home,
    recovery_arrived: e.arrived,
    receiptCount: e.receiptCount,
    recovery_amount: e.amount,
    recovery_nights: e.nights,
  }))

  const homes = [...groupByHome(forStats).entries()]
    .map(([home, t]) => ({ home, ...t }))
    .sort((a, b) => b.realized - a.realized)

  return NextResponse.json({
    rows: enriched,
    homes,
    totals: totalsOf(forStats),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
