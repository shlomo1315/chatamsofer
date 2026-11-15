import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// סטטיסטיקה ציבורית לאתר התדמית.
// מחזיר סיכומים מצטברים בלבד: אין כאן שמות, ת.ז., טלפונים, כתובות או מזהי רשומות.
// השמות היחידים שיוצאים הם שני הדורות הראשונים בעץ (החתם סופר ובניו), שהם ציבוריים.

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
}

type Row = Record<string, unknown>

// Supabase מחזיר עד 1000 שורות לבקשה, לכן קוראים בדפים. רק עמודות לא-מזהות.
async function fetchAll(db: NonNullable<ReturnType<typeof createAdminClient>>, table: string, cols: string): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data ?? []) as unknown as Row[]))
    if (!data || data.length < 1000) break
  }
  return out
}

const countBy = (rows: Row[], key: string, fallback = 'unknown') =>
  rows.reduce<Record<string, number>>((acc, r) => {
    const k = (r[key] as string | null) ?? fallback
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})

const sumOf = (rows: Row[], key: string) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)

// ספירה לפי חודש (YYYY-MM) ל-12 החודשים האחרונים
function byMonth(rows: Row[]) {
  const since = new Date()
  since.setMonth(since.getMonth() - 11, 1)
  since.setHours(0, 0, 0, 0)
  const out: Record<string, number> = {}
  for (let d = new Date(since); d <= new Date(); d.setMonth(d.getMonth() + 1)) {
    out[d.toISOString().slice(0, 7)] = 0
  }
  for (const r of rows) {
    const c = r.created_at ? new Date(r.created_at as string) : null
    if (!c || c < since) continue
    const k = c.toISOString().slice(0, 7)
    if (k in out) out[k]++
  }
  return out
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET() {
  const db = createAdminClient()
  if (!db) return NextResponse.json({ error: 'not configured' }, { status: 503, headers: CORS })

  try {
    const [ben, mat, loans, lineage, dists, recips, docs, staff, families, homes, activity] = await Promise.all([
      fetchAll(db, 'beneficiaries', 'eligibility_status, children_count, created_at'),
      fetchAll(db, 'maternity_aids', 'status, card_load_status, card_balance, card_load_amount, created_at'),
      fetchAll(db, 'loans', 'status, amount, installments, created_at'),
      fetchAll(db, 'lineage_nodes', 'generation, status'),
      fetchAll(db, 'distributions', 'id, name, holiday, status, total_budget, created_at'),
      fetchAll(db, 'distribution_recipients', 'distribution_id, status'),
      fetchAll(db, 'documents', 'verified'),
      fetchAll(db, 'profiles', 'role, is_active'),
      db.from('families').select('id', { count: 'exact', head: true }),
      db.from('recovery_homes').select('id', { count: 'exact', head: true }),
      db.from('activity_log').select('id', { count: 'exact', head: true }),
    ])

    const topNames = await db.from('lineage_nodes').select('name, generation').lte('generation', 1).order('generation').order('name')

    const loanAmounts = loans.map(l => Number(l.amount) || 0)
    const activeLoanRows = loans.filter(l => l.status === 'approved' || l.status === 'active')
    const gens = lineage.map(n => Number(n.generation) || 0)

    const body = {
      generated_at: new Date().toISOString(),
      beneficiaries: {
        total: ben.length,
        by_status: countBy(ben, 'eligibility_status', 'pending'),
        children_total: sumOf(ben, 'children_count'),
        by_month: byMonth(ben),
      },
      families: families.count ?? 0,
      documents: { total: docs.length, verified: docs.filter(d => d.verified).length },
      lineage: {
        nodes: lineage.length,
        verified: lineage.filter(n => n.status !== 'pending').length,
        pending: lineage.filter(n => n.status === 'pending').length,
        generations: gens.length ? Math.max(...gens) + 1 : 0,
        by_generation: countBy(lineage.map(n => ({ g: String(n.generation ?? 0) })), 'g'),
        top_names: (topNames.data ?? []).map(n => ({ g: n.generation, name: n.name })),
      },
      maternity: {
        total: mat.length,
        by_status: countBy(mat, 'status', 'pending'),
        by_card_status: countBy(mat, 'card_load_status', 'idle'),
        card_balance_total: sumOf(mat, 'card_balance'),
        card_loaded_total: sumOf(mat.filter(m => m.card_load_status === 'loaded' || m.card_load_status === 'unloaded'), 'card_load_amount'),
      },
      recovery_homes: homes.count ?? 0,
      loans: {
        total: loans.length,
        by_status: countBy(loans, 'status', 'pending'),
        amount_total: loanAmounts.reduce((a, b) => a + b, 0),
        amount_active: sumOf(activeLoanRows, 'amount'),
        avg_amount: loans.length ? Math.round(loanAmounts.reduce((a, b) => a + b, 0) / loans.length) : 0,
        avg_installments: loans.length ? Math.round(sumOf(loans, 'installments') / loans.length) : 0,
        by_month: byMonth(loans),
      },
      distributions: dists
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .map(d => {
          const rs = recips.filter(r => r.distribution_id === d.id)
          return {
            name: d.name, holiday: d.holiday, status: d.status, budget: d.total_budget,
            recipients: rs.length, received: rs.filter(r => r.status === 'received').length,
          }
        }),
      staff: countBy(staff.filter(s => s.is_active), 'role'),
      activity_log: activity.count ?? 0,
    }

    return NextResponse.json(body, { headers: CORS })
  } catch (e) {
    console.error('public-stats error:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: CORS })
  }
}
