import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { buildApprovedRefTree } from '@/lib/lineageApprovedRef'
import { findDeepReviewGaps, reviewDeepReviewFamilies, classifyLineage, GAP_KIND_LABEL, type GapBen, type GapNode, type GapKind } from '@/lib/deepReviewGaps'

type BenRow = GapBen & { deep_review_reason?: string | null }

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// דוח: משפחות ש-5 הדורות הראשונים שלהן אינם תקינים מול הקובץ המאושר,
// ואינן בבדיקה מעמיקה (ולא נדחו). ראו lib/deepReviewGaps.ts.
//
// ⚠️ קריאה בלבד, מנהל בלבד. לא משנה סטטוס ולא שולח מיילים.
// ⚠️ הקובץ המאושר נטען ישירות ולא דרך getApprovedRefTree: שם כשל בטעינה
// מחזיר בודק מתירני, וכאן זה היה מחזיר "אין פערים" שקרי.
//
// ?id=302746730 — משפחה אחת, בכל סטטוס (גם בבדיקה מעמיקה): מה השער אומר עליה.
// ?scope=in_review — הכיוון ההפוך: משפחות בבדיקה מעמיקה, ואילו מהן כבר תקינות.
// ?format=csv — לאקסל (בשני הדוחות).
// ─────────────────────────────────────────────────────────────────────────────

type RefRow = { key: string; name: string; generation: number; parent_key: string | null }

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const idFilter = (req.nextUrl.searchParams.get('id') ?? '').replace(/\D/g, '')
  const csv = req.nextUrl.searchParams.get('format') === 'csv'
  const inReview = req.nextUrl.searchParams.get('scope') === 'in_review'

  const [ref, nodes, bens] = await Promise.all([
    fetchAllRows<RefRow>((f, t) => admin.from('lineage_approved_ref').select('key, name, generation, parent_key').range(f, t)),
    fetchAllRows<GapNode>((f, t) => admin.from('lineage_nodes').select('id, name, parent_id, generation').range(f, t)),
    fetchAllRows<BenRow>((f, t) => {
      let q = admin.from('beneficiaries')
        .select('id, id_number, full_name, spouse_name, family_name, eligibility_status, deep_review_reason, lineage_node_id, lineage_chain, lineage_manual, registration_source, created_at')
        .order('created_at', { ascending: true })
      if (idFilter) q = q.eq('id_number', idFilter)
      else if (inReview) q = q.eq('eligibility_status', 'deep_review')
      return q.range(f, t)
    }),
  ])
  const loadError = ref.error || nodes.error || bens.error
  if (loadError) return NextResponse.json({ error: `טעינה נכשלה: ${loadError}` }, { status: 500 })
  if (!ref.rows.length) return NextResponse.json({ error: 'הקובץ המאושר ריק — אין מול מה לבדוק' }, { status: 500 })

  const approved = buildApprovedRefTree(ref.rows)

  // ⚠️ משפחה אחת נבדקת בכל סטטוס. עד כה findDeepReviewGaps דילגה על מי שכבר
  // בבדיקה מעמיקה, ולכן ?id= החזיר gap=null בדיוק למשפחה שרצו להבין (אולמן).
  if (idFilter) {
    const b = bens.rows[0]
    const finding = b ? classifyLineage(b, new Map(nodes.rows.map(n => [n.id, n])), approved) : null
    return NextResponse.json({
      found: !!b,
      family: b ? { id_number: b.id_number, status: b.eligibility_status, deep_review_reason: b.deep_review_reason ?? null, lineage_node_id: b.lineage_node_id, created_at: b.created_at, registration_source: b.registration_source } : null,
      gap: finding,
      label: finding ? GAP_KIND_LABEL[finding.kind] : null,
      valid: !!b && !finding,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  if (inReview) {
    const list = reviewDeepReviewFamilies(bens.rows, nodes.rows, approved)
    const byKind: Partial<Record<GapKind | 'valid', number>> = {}
    for (const r of list) {
      const k = r.finding?.kind ?? 'valid'
      byKind[k] = (byKind[k] ?? 0) + 1
    }
    if (csv) {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const lines = [
        ['ת"ז', 'שם', 'מצב כעת', 'דור', 'פירוט', 'הסיבה שנרשמה', 'מקור רישום', 'נרשם'].map(esc).join(','),
        ...list.map(r => [
          r.id_number, r.name, r.finding ? GAP_KIND_LABEL[r.finding.kind] : 'תקין כעת',
          r.finding?.generation, r.finding?.detail, r.reason, r.registration_source, r.created_at?.slice(0, 10),
        ].map(esc).join(',')),
      ]
      return new NextResponse('﻿' + lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="deep-review-families.csv"',
          'Cache-Control': 'no-store',
        },
      })
    }
    return NextResponse.json({
      total: list.length,
      stillFaulty: list.filter(r => r.finding).length,
      nowValid: list.filter(r => !r.finding).length,
      byKind,
      labels: GAP_KIND_LABEL,
      rows: list,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const rows = findDeepReviewGaps(bens.rows, nodes.rows, approved)

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
