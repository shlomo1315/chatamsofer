import { NextResponse, type NextRequest } from 'next/server'
import { requireNonMailStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { syncTransactions } from '@/lib/holidayTransactions'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// היסטוריית עסקאות החגים.
//
// 🔴 GET קורא מהמטמון במסד — מיידי. POST מסנכרן מנדרים, וזו הפעולה
// האיטית (קריאה לכל משפחה). לכן היא ידנית ולא רצה בפתיחת המסך.

interface BenRel { id_number: string | null; family_name: string | null; full_name: string | null }
const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

export async function GET(request: NextRequest) {
  const staff = await requireNonMailStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const distributionId = request.nextUrl.searchParams.get('distribution_id') ?? ''
  if (!distributionId) return NextResponse.json({ error: 'חסר מזהה חלוקה' }, { status: 400 })

  // מזהי הרשומות בחלוקה — ⚠️ fetchAllRows מפני תקרת 1,000.
  const { rows: recs } = await fetchAllRows<{ id: string; beneficiary: BenRel | BenRel[] | null }>(
    (from, to) => db.from('distribution_recipients')
      .select('id, beneficiary:beneficiaries(id_number, family_name, full_name)')
      .eq('distribution_id', distributionId).range(from, to))

  const nameById = new Map<string, string>()
  for (const r of recs) {
    const b = one(r.beneficiary)
    nameById.set(r.id, [b?.family_name, b?.full_name].filter(Boolean).join(' ') || 'ללא שם')
  }

  const ids = recs.map(r => r.id)
  if (!ids.length) return NextResponse.json({ transactions: [], total: 0, sum: 0 })

  const { rows: tx } = await fetchAllRows<{
    id: string; recipient_id: string; tx_date: string | null; store_name: string; amount: number
  }>((from, to) => db.from('holiday_transactions')
    .select('id, recipient_id, tx_date, store_name, amount')
    .in('recipient_id', ids)
    .order('tx_date', { ascending: false, nullsFirst: false })
    .range(from, to))

  return NextResponse.json({
    transactions: tx.map(t => ({
      id: t.id,
      familyName: nameById.get(t.recipient_id) ?? '—',
      date: t.tx_date,
      store: t.store_name,
      amount: Number(t.amount ?? 0),
    })),
    total: tx.length,
    sum: tx.reduce((a, t) => a + Number(t.amount ?? 0), 0),
  })
}

export async function POST(request: NextRequest) {
  const staff = await requireNonMailStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { distribution_id?: string }
  const distributionId = String(body.distribution_id ?? '')
  if (!distributionId) return NextResponse.json({ error: 'חסר מזהה חלוקה' }, { status: 400 })

  // ⚠️ רק מי שכרטיסו נטען — לשאר אין מה למשוך, וקריאה עליהם היא זמן מבוזבז.
  const { rows } = await fetchAllRows<{ id: string; beneficiary: BenRel | BenRel[] | null }>(
    (from, to) => db.from('distribution_recipients')
      .select('id, beneficiary:beneficiaries(id_number, family_name, full_name)')
      .eq('distribution_id', distributionId).eq('load_status', 'loaded').range(from, to))

  const targets = rows
    .map(r => ({ recipientId: r.id, idNumber: one(r.beneficiary)?.id_number ?? null }))
    .filter(t => !!t.idNumber)

  if (!targets.length) return NextResponse.json({ ok: true, synced: 0, transactions: 0, note: 'אין כרטיסים טעונים' })

  try {
    const res = await syncTransactions(db, targets, { delayMs: 100 })
    return NextResponse.json({ ok: true, ...res })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'תקלה'
    console.error('[holiday-tx] סנכרון נכשל:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
