import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { buildApprovedRefTree } from '@/lib/lineageApprovedRef'
import { findDeepReviewGaps, GAP_KIND_LABEL, type GapBen, type GapNode, type GapKind } from '@/lib/deepReviewGaps'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// דוח: משפחות ש-5 הדורות הראשונים שלהן אינם תקינים מול הקובץ המאושר,
// ואינן בבדיקה מעמיקה (ולא נדחו). ראו lib/deepReviewGaps.ts.
//
// ⚠️ קריאה בלבד, מנהל בלבד. לא משנה סטטוס ולא שולח מיילים.
// ⚠️ הקובץ המאושר נטען ישירות ולא דרך getApprovedRefTree: שם כשל בטעינה
// מחזיר בודק מתירני, וכאן זה היה מחזיר "אין פערים" שקרי.
//
// ?id=302746730 — משפחה אחת (גם אם תקינה). ?format=csv — לאקסל.
// ─────────────────────────────────────────────────────────────────────────────

type RefRow = { key: string; name: string; generation: number; parent_key: string | null }

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const idFilter = (req.nextUrl.searchParams.get('id') ?? '').replace(/\D/g, '')
  const csv = req.nextUrl.searchParams.get('format') === 'csv'

  const [ref, nodes, bens] = await Promise.all([
    fetchAllRows<RefRow>((f, t) => admin.from('lineage_approved_ref').select('key, name, generation, parent_key').range(f, t)),
    fetchAllRows<GapNode>((f, t) => admin.from('lineage_nodes').select('id, name, parent_id, generation').range(f, t)),
    fetchAllRows<GapBen>((f, t) => {
      let q = admin.from('beneficiaries')
        .select('id, id_number, full_name, spouse_name, family_name, eligibility_status, lineage_node_id, lineage_chain, lineage_manual, registration_source, created_at')
        .order('created_at', { ascending: true })
      if (idFilter) q = q.eq('id_number', idFilter)
      return q.range(f, t)
    }),
  ])
  const loadError = ref.error || nodes.error || bens.error
  if (loadError) return NextResponse.json({ error: `טעינה נכשלה: ${loadError}` }, { status: 500 })
  if (!ref.rows.length) return NextResponse.json({ error: 'הקובץ המאושר ריק — אין מול מה לבדוק' }, { status: 500 })

  const approved = buildApprovedRefTree(ref.rows)
  const rows = findDeepReviewGaps(bens.rows, nodes.rows, approved)

  if (idFilter) {
    const b = bens.rows[0]
    return NextResponse.json({
      found: !!b,
      family: b ? { id_number: b.id_number, status: b.eligibility_status, lineage_node_id: b.lineage_node_id, created_at: b.created_at, registration_source: b.registration_source } : null,
      gap: rows[0] ?? null,
      label: rows[0] ? GAP_KIND_LABEL[rows[0].kind] : null,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const byKind: Partial<Record<GapKind, number>> = {}
  const byStatus: Record<string, number> = {}
  for (const r of rows) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
    byStatus[r.status ?? 'null'] = (byStatus[r.status ?? 'null'] ?? 0) + 1
  }

  if (csv) {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['ת"ז', 'שם', 'סטטוס', 'סוג הפער', 'דור', 'פירוט', 'מקור רישום', 'נרשם'].map(esc).join(','),
      ...rows.map(r => [r.id_number, r.name, r.status, GAP_KIND_LABEL[r.kind], r.generation, r.detail, r.registration_source, r.created_at?.slice(0, 10)].map(esc).join(',')),
    ]
    return new NextResponse('﻿' + lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="deep-review-gaps.csv"',
        'Cache-Control': 'no-store',
      },
    })
  }

  return NextResponse.json({
    scanned: bens.rows.length,
    total: rows.length,
    byKind,
    byStatus,
    labels: GAP_KIND_LABEL,
    rows,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
