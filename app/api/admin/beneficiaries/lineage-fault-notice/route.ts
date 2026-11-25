import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { lineageFaultEmail } from '@/lib/lineageFaultEmail'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { logActivity } from '@/lib/activityLog'
import {
  DEFAULT_LINEAGE_FAULT_TEMPLATE, LINEAGE_FAULT_ACTION, LINEAGE_FAULT_BATCH, LINEAGE_FAULT_TEMPLATE_KEY, NAME_TOKEN,
  israelDayStart, normalizeLineageFaultTemplate, planLineageFaultNotice, recipientNameOf, type FaultRow, type LineageFaultTemplate,
} from '@/lib/lineageFaultNotice'
import { loadApprovedRefStrict } from '@/lib/earlyLineageGate'
import { linkSentRecently } from '@/lib/lineageInquiry'
import { planDeepReviewRecheck, type RecheckBen } from '@/lib/deepReviewRecheck'
import type { GapNode } from '@/lib/deepReviewGaps'

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
//
// הנוסח נערך במסך ונשמר ב-app_settings (LINEAGE_FAULT_TEMPLATE_KEY):
//   { action: 'render', template, sampleName } → המייל לתצוגה חיה, בלי מסד
//   { action: 'save', template }               → שמירת הנוסח
// ⚠️ השליחה קוראת תמיד את הנוסח השמור במסד, לא נוסח שהגיע בבקשה.

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

// 🔴 מי מקבל (בסבב הראשון ובתזכורת): רק מי שבבדיקה מעמיקה *וגם* סדר הדורות
// שלו נכשל עכשיו באותו שער כמו ברישום (planDeepReviewRecheck).
//   • סדר הדורות תקין (chainOk) → לא מקבל. הסטטוס לבד לא מספיק: ב-24.11 18:25
//     המייל נשלח לפי הסטטוס בלבד, וקיבלו אותו גם משפחות שהשרשרת שלהן תקינה.
//   • סיבה שהמזכירות הקלידה (otherReason) → בדיקה מעמיקה מסיבה אחרת, לא מקבל.
//   • כשל בטעינת הקובץ המאושר → לא נשלח לאף אחד.
// סבב חוזר (resend): נחסם רק מי שקיבל *היום* (שעון ישראל), ולא כל מי שקיבל אי פעם.
type PlanRow = FaultRow & RecheckBen & { lineage_link_sent_at?: string | null }

async function loadPlan(admin: SupabaseClient, resend: boolean) {
  const approved = await loadApprovedRefStrict(admin)
  if (!approved) throw new Error('הקובץ המאושר לא נטען, ולכן אי אפשר לוודא מי באמת עם תקלה בסדר הדורות. לא נשלח שום מייל.')
  const [all, nodes] = await Promise.all([
    fetchAll<PlanRow>((a, b) => admin.from('beneficiaries')
      .select('id, id_number, full_name, family_name, spouse_name, marital_status, email, eligibility_status, lineage_node_id, lineage_chain, lineage_manual, deep_review_reason, lineage_link_sent_at')
      .eq('eligibility_status', 'deep_review').order('id').range(a, b)),
    fetchAll<GapNode>((a, b) => admin.from('lineage_nodes').select('id, name, parent_id, generation').range(a, b)),
  ])
  const check = planDeepReviewRecheck(all, new Map(nodes.map(n => [n.id, n])), approved)
  const faulty = new Set<PlanRow>([...check.reasonUpdate.map(r => r.ben as PlanRow), ...(check.unchanged as PlanRow[])])
  const rows = all.filter(r => faulty.has(r))
  const sent = await fetchAll<{ entity_id: string | null }>((a, b) => {
    let q = admin.from('activity_log').select('entity_id').eq('action', LINEAGE_FAULT_ACTION)
    if (resend) q = q.gte('created_at', israelDayStart())
    return q.order('created_at').range(a, b)
  })
  // מי שכבר קיבל קישור בתוקף (אישי או אוטומטי, ראו lib/lineageInquiry) נחשב "כבר קיבל".
  const sentIds = new Set(sent.map(s => s.entity_id).filter((x): x is string => !!x))
  for (const r of rows) if (linkSentRecently(r.lineage_link_sent_at)) sentIds.add(r.id)
  return {
    ...planLineageFaultNotice(rows, sentIds),
    otherReason: check.manual as PlanRow[],
    chainOk: check.release as PlanRow[],
  }
}

async function loadTemplate(admin: SupabaseClient): Promise<LineageFaultTemplate> {
  const { data, error } = await admin.from('app_settings').select('value').eq('key', LINEAGE_FAULT_TEMPLATE_KEY).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.value) return DEFAULT_LINEAGE_FAULT_TEMPLATE
  try { return normalizeLineageFaultTemplate(JSON.parse(data.value as string)) } catch { return DEFAULT_LINEAGE_FAULT_TEMPLATE }
}

const siteBase = () =>
  (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')

const sampleLink = () => `${siteBase()}/lineage-review/<קישור-אישי-לכל-משפחה>`
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })

export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  let body: { send?: boolean; resend?: boolean; action?: string; template?: unknown; sampleName?: unknown } = {}
  try { body = await request.json() } catch { /* בלי גוף = תצוגה מקדימה */ }
  const resend = body.resend === true

  // תצוגה חיה בזמן העריכה: אותה בנייה בדיוק כמו בשליחה, בלי מסד.
  if (body.action === 'render') {
    const name = typeof body.sampleName === 'string' && body.sampleName.trim() ? body.sampleName.trim().slice(0, 120) : 'כהן משה'
    const mail = lineageFaultEmail({ recipientName: name, link: sampleLink(), template: normalizeLineageFaultTemplate(body.template) })
    return NextResponse.json(mail)
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  if (body.action === 'save') {
    const template = normalizeLineageFaultTemplate(body.template)
    const { error } = await admin.from('app_settings').upsert(
      { key: LINEAGE_FAULT_TEMPLATE_KEY, value: JSON.stringify(template), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    if (error) return fail(error)
    return NextResponse.json({ ok: true, template })
  }

  let plan, template
  try { [plan, template] = await Promise.all([loadPlan(admin, resend), loadTemplate(admin)]) } catch (e) { return fail(e) }

  const sender = mailFor('igud')
  const names = (rows: FaultRow[]) => rows.map(r => ({ id: r.id, name: recipientNameOf(r), email: r.email }))

  if (body.send !== true) {
    const first = plan.toSend[0]
    const sample = lineageFaultEmail({
      recipientName: first ? recipientNameOf(first) : 'כהן משה',
      link: sampleLink(),
      template,
    })
    return NextResponse.json({
      dryRun: true,
      resend,
      total: plan.toSend.length + plan.noEmail.length + plan.noLineage.length + plan.alreadySent.length + plan.otherReason.length + plan.chainOk.length,
      toSend: plan.toSend.length,
      noEmail: names(plan.noEmail),
      noLineage: names(plan.noLineage),
      otherReason: names(plan.otherReason),
      chainOk: names(plan.chainOk),
      alreadySent: plan.alreadySent.length,
      from: `${sender.fromName} <${sender.fromEmail}>`,
      sample: { to: first?.email ?? null, name: first ? recipientNameOf(first) : 'כהן משה', subject: sample.subject, html: sample.html },
      template,
      defaultTemplate: DEFAULT_LINEAGE_FAULT_TEMPLATE,
    })
  }

  // שם המשפחה נמחק מהגוף: לא שולחים מייל בלי פנייה אישית.
  if (!template.bodyHtml.includes(NAME_TOKEN)) {
    return NextResponse.json({ error: 'שם המשפחה חסר בגוף המייל. יש להחזיר אותו ולשמור את הנוסח לפני השליחה.' }, { status: 400 })
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

    const mail = lineageFaultEmail({ recipientName, link: `${siteBase()}/lineage-review/${token}`, template })
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
