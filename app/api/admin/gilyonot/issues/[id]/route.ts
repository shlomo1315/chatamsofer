import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { loadIssue } from '@/lib/gilyonotSender'
import { sanitizeMailHtml } from '@/lib/gilyonotRichHtml'
import { normalizeDesign } from '@/lib/gilyonotDesign'

// עריכה ומחיקה של גיליון — רק כל עוד הוא טיוטה (לפני שליחה).
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function PATCH(request: Request, { params }: Ctx) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })
  if (issue.status !== 'draft') return NextResponse.json({ error: 'אי אפשר לערוך גיליון שכבר נשלח' }, { status: 409 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const patch = {
    title: str(body.title, 120) || issue.title,
    parasha: str(body.parasha, 60) || issue.parasha,
    subject: str(body.subject, 200) || issue.subject,
    intro: typeof body.intro === 'string' ? (str(body.intro, 4000) || null) : issue.intro,
    // גוף המייל מהעורך: מנוקה כאן, בשרת, לפי רשימת היתרים.
    body_html: typeof body.body_html === 'string' ? (sanitizeMailHtml(body.body_html) || null) : issue.body_html,
    design: body.design !== undefined ? normalizeDesign(body.design) : normalizeDesign(issue.design),
    updated_at: new Date().toISOString(),
  }
  const { error } = await db.from('gilyonot_issues').update(patch).eq('id', issue.id).eq('status', 'draft')
  if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_r: Request, { params }: Ctx) {
  const staff = await requirePermission('gilyonot', 'delete')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const issue = await loadIssue(db, (await params).id)
  if (!issue) return NextResponse.json({ error: 'הגיליון לא נמצא' }, { status: 404 })
  if (issue.status !== 'draft') return NextResponse.json({ error: 'גיליון שנשלח נשאר בארכיון ואי אפשר למחוק אותו' }, { status: 409 })
  const { error } = await db.from('gilyonot_issues').delete().eq('id', issue.id).eq('status', 'draft')
  if (error) return NextResponse.json({ error: 'המחיקה נכשלה' }, { status: 500 })
  if (issue.file_path) {
    // כשל במחיקת הקבצים לא עוצר מחיקת טיוטה תקועה
    await db.storage.from('documents').remove([...new Set([issue.file_path, issue.file_path.replace(/\/[^/]+(\.\w+)$/, '/gilyon$1'), issue.file_path.replace(/\/[^/]+(\.\w+)$/, '/compressed$1')])]).catch(() => null)
  }
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_issue_delete', entityType: 'gilyonot_issue', entityId: issue.id, details: { title: issue.title } })
  return NextResponse.json({ ok: true })
}
