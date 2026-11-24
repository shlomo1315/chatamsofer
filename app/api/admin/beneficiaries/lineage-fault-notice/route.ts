import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { lineageFaultEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { logActivity } from '@/lib/activityLog'
import {
  LINEAGE_FAULT_ACTION, LINEAGE_FAULT_BATCH, planLineageFaultNotice, recipientNameOf, type FaultRow,
} from '@/lib/lineageFaultNotice'

export const dynamic = 'force-dynamic'

// הודעה מרוכזת לכל המשפחות בסטטוס "בדיקה מעמיקה": התגלתה תקלה בסדר הדורות,
// ויש להסדיר אותו מחדש בקישור אישי.
//
// 🔴 ברירת המחדל היא תצוגה מקדימה בלבד (בלי שליחה ובלי שינוי במסד).
// שליחה רק עם { send: true }, ובכל קריאה עד LINEAGE_FAULT_BATCH מיילים; המסך
// קורא שוב ושוב עד שלא נשאר אף אחד.
//
// ⚠️ מניעת כפילויות: כל משפחה שקיבלה נרשמת ב-activity_log עם
// LINEAGE_FAULT_ACTION, ומשפחה שרשומה שם לא נשלחת שוב, גם בהרצה חוזרת.

const LINK_DAYS = 30 // חייב להתאים לנוסח במייל ול-send-lineage-link

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

async function loadPlan(admin: SupabaseClient) {
  const rows = await fetchAll<FaultRow>((a, b) => admin.from('beneficiaries')
    .select('id, full_name, family_name, spouse_name, email, lineage_node_id')
    .eq('eligibility_status', 'deep_review').order('id').range(a, b))
  const sent = await fetchAll<{ entity_id: string | null }>((a, b) => admin.from('activity_log')
    .select('entity_id').eq('action', LINEAGE_FAULT_ACTION).order('created_at').range(a, b))
  return planLineageFaultNotice(rows, new Set(sent.map(s => s.entity_id).filter((x): x is string => !!x)))
}

const siteBase = () =>
  (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')

export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  let body: { send?: boolean } = {}
  try { body = await request.json() } catch { /* בלי גוף = תצוגה מקדימה */ }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  let plan
  try { plan = await loadPlan(admin) } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  const sender = mailFor('igud')
  const names = (rows: FaultRow[]) => rows.map(r => ({ id: r.id, name: recipientNameOf(r), email: r.email }))

  if (body.send !== true) {
    const first = plan.toSend[0]
    const sample = lineageFaultEmail({
      recipientName: first ? recipientNameOf(first) : 'כהן משה',
      link: `${siteBase()}/lineage-review/<קישור-אישי-לכל-משפחה>`,
    })
    return NextResponse.json({
      dryRun: true,
      total: plan.toSend.length + plan.noEmail.length + plan.noLineage.length + plan.alreadySent.length,
      toSend: plan.toSend.length,
      noEmail: names(plan.noEmail),
      noLineage: names(plan.noLineage),
      alreadySent: plan.alreadySent.length,
      from: `${sender.fromName} <${sender.fromEmail}>`,
      sample: { to: first?.email ?? null, subject: sample.subject, html: sample.html },
    })
  }

  const batch = plan.toSend.slice(0, LINEAGE_FAULT_BATCH)
  const failed: { name: string; email: string; error: string }[] = []
  let sent = 0
  for (const ben of batch) {
    const recipientName = recipientNameOf(ben)
    const token = randomBytes(16).toString('base64url')
    const { error: invErr } = await admin.from('lineage_share_invites').insert({
      token,
      root_node_id: ben.lineage_node_id,
      beneficiary_id: ben.id,
      mode: 'order',
      expires_at: new Date(Date.now() + LINK_DAYS * 86400_000).toISOString(),
      recipient_name: recipientName,
      recipient_email: ben.email,
      created_by: staff.userId,
    })
    if (invErr) { failed.push({ name: recipientName, email: ben.email, error: invErr.message }); continue }

    const mail = lineageFaultEmail({ recipientName, link: `${siteBase()}/lineage-review/${token}` })
    let res: { ok: boolean; error?: string }
    try {
      res = await deliverMail(ben.email, mail.subject, mail.html, [], { ...sender, transactional: true })
    } catch (e) {
      res = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    if (!res.ok) { failed.push({ name: recipientName, email: ben.email, error: res.error ?? 'השליחה נכשלה' }); continue }

    sent++
    await admin.from('beneficiaries').update({ lineage_link_sent_at: new Date().toISOString() }).eq('id', ben.id)
    await logActivity(admin, {
      userId: staff.userId, action: LINEAGE_FAULT_ACTION,
      entityType: 'beneficiary', entityId: ben.id,
      details: { email: ben.email, rootNodeId: ben.lineage_node_id },
    })
  }

  return NextResponse.json({
    dryRun: false,
    sent,
    failed,
    remaining: plan.toSend.length - sent,
  })
}
