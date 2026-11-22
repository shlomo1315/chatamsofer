import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 22.11.2026: תיקון חד-פעמי — תיקים "ממתינים לתשובת היולדת" שהמשפחה כבר פעלה בהם.
//
// עד היום תיק יצא מההמתנה רק בתשובה למייל. משפחה שתיקנה דורות בקישור, באזור
// האישי, או העלתה מסמך — נשארה תקועה (20 תיקים). מעכשיו זה נרשם אוטומטית
// (markMaternityInquiryAnswered); הנתיב הזה מטפל במה שנתקע לפני התיקון.
//
// GET  — תצוגה בלבד: אילו תיקים נתקעו ומה המשפחה עשתה אחרי הבירור.
// POST — רושם בכל אחד מהם הודעת 'applicant' אוטומטית (התיק חוזר לרשימה).
// ─────────────────────────────────────────────────────────────────────────────

type Hit = { aidId: string; family: string; askedAt: string; actions: string[] }

async function findStuck(): Promise<Hit[] | { error: string }> {
  const db = getServiceClient()
  if (!db) return { error: 'שגיאת שרת' }

  const { data: aids } = await db.from('maternity_aids')
    .select('id, beneficiary_id, beneficiary:beneficiaries(family_name, spouse_name, full_name)')
    .in('status', ['pending', 'deep_review'])
  const hits: Hit[] = []
  for (const a of aids ?? []) {
    const { data: last } = await db.from('maternity_messages')
      .select('direction, created_at').eq('aid_id', a.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (last?.direction !== 'staff' || !a.beneficiary_id) continue
    const since = last.created_at as string
    const actions: string[] = []

    const { data: logs } = await db.from('activity_log')
      .select('action, created_at').eq('entity_id', a.beneficiary_id)
      .in('action', ['lineage_review_applied']).gt('created_at', since)
    if (logs?.length) actions.push(`תיקנה את סדר הדורות בקישור (${logs.length})`)

    const { data: invites } = await db.from('lineage_share_invites')
      .select('token').eq('beneficiary_id', a.beneficiary_id)
    const tokens = (invites ?? []).map(i => i.token as string)
    if (tokens.length) {
      const { count } = await db.from('lineage_review_suggestions')
        .select('id', { count: 'exact', head: true }).in('token', tokens).gt('created_at', since)
      if (count) actions.push(`שלחה הערה/תיקון בקישור (${count})`)
    }
    const { count: portalFix } = await db.from('lineage_review_suggestions')
      .select('id', { count: 'exact', head: true }).eq('beneficiary_id', a.beneficiary_id).gt('created_at', since)
    if (portalFix) actions.push(`שלחה תיקון דורות מהאזור האישי (${portalFix})`)

    const { count: docs } = await db.from('documents')
      .select('id', { count: 'exact', head: true }).eq('beneficiary_id', a.beneficiary_id).gt('uploaded_at', since)
    if (docs) actions.push(`העלתה מסמכים (${docs})`)

    if (!actions.length) continue
    const raw = (a as { beneficiary?: unknown }).beneficiary
    const b = (Array.isArray(raw) ? raw[0] : raw) as { family_name?: string; spouse_name?: string; full_name?: string } | undefined
    hits.push({
      aidId: a.id as string,
      family: [b?.family_name, b?.spouse_name || b?.full_name].filter(Boolean).join(' '),
      askedAt: since,
      actions,
    })
  }
  return hits
}

export async function GET() {
  if (!(await requirePermission('maternity', 'edit'))) return forbidden()
  const r = await findStuck()
  if ('error' in r) return NextResponse.json(r, { status: 500 })
  return NextResponse.json({ count: r.length, cases: r })
}

export async function POST(_req: NextRequest) {
  if (!(await requirePermission('maternity', 'edit'))) return forbidden()
  const r = await findStuck()
  if ('error' in r) return NextResponse.json(r, { status: 500 })
  const db = getServiceClient()!
  let done = 0
  for (const h of r) {
    const { error } = await db.from('maternity_messages').insert({
      aid_id: h.aidId,
      direction: 'applicant',
      body: `✅ המשפחה פעלה אחרי הבירור: ${h.actions.join(' · ')} (נרשם אוטומטית — לא השיבה למייל)`,
      sender_name: 'המערכת',
      is_read: false,
    })
    if (!error) done++
  }
  return NextResponse.json({ count: r.length, released: done, cases: r })
}
