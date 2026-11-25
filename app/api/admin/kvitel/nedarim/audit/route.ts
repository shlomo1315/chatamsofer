import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { getKvitelMapping } from '@/lib/kvitelNedarimPull'
import { AUDIT_REASON_LABEL, auditNedarimSubmission, type AuditReason } from '@/lib/kvitelNedarimAudit'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// דוח קריאה בלבד: לכל הגשת קוויטל מנדרים פלוס, כמה שמות יש במקור וכמה נקלטו (lib/kvitelNedarimAudit).
// נפתח בדפדפן, בלי שום שינוי ובלי פנייה לנדרים. בלי שמות בפלט, בגלל נטפרי.

type Row = { id: string; status: string; source_ref: string | null; submitted_at: string; raw_text: string | null; kvitel_request_lines: { id: string }[] }

export async function GET() {
  const staff = await requirePermission('kvitel', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const mapping = await getKvitelMapping(db)
  const res = await fetchAllRows<Row>((f, t) => db.from('kvitel_requests')
    .select('id, status, source_ref, submitted_at, raw_text, kvitel_request_lines(id)')
    .eq('channel', 'nedarim').order('submitted_at', { ascending: false }).range(f, t))
  if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })

  const byReason = Object.fromEntries(Object.keys(AUDIT_REASON_LABEL).map(k => [k, 0])) as Record<AuditReason, number>
  let form = 0, withMissing = 0, missingNames = 0, sourceNames = 0, capturedNames = 0
  const problems = []
  for (const r of res.rows) {
    const kind = r.source_ref?.startsWith('nedarim-form:') ? 'form' : 'direct'
    if (kind === 'form') form++
    const a = auditNedarimSubmission({ kind, rawText: r.raw_text, captured: (r.kvitel_request_lines ?? []).length }, mapping)
    sourceNames += a.source; capturedNames += a.captured
    for (const x of a.reasons) byReason[x]++
    if (a.missing) { withMissing++; missingNames += a.missing }
    if (a.missing || a.reasons.length) {
      problems.push({
        id: r.id, ref: r.source_ref, kind: kind === 'form' ? 'משיכה מהטופס' : 'קליטה ישירה', status: r.status, submittedAt: r.submitted_at,
        source: a.source, structured: a.structured, free: a.free, captured: a.captured, current: a.current,
        missing: a.missing, unclear: a.unclear, reasons: a.reasons.map(x => AUDIT_REASON_LABEL[x]),
      })
    }
  }
  problems.sort((x, y) => y.missing - x.missing || y.unclear - x.unclear)

  return NextResponse.json({
    total: res.rows.length, form, direct: res.rows.length - form,
    sourceNames, capturedNames, withMissing, missingNames,
    byReason: Object.fromEntries(Object.entries(byReason).filter(([, n]) => n).map(([k, n]) => [AUDIT_REASON_LABEL[k as AuditReason], n])),
    problems,
  })
}
