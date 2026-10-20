import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { sanitizeMailHtml } from '@/lib/gilyonotRichHtml'
import { normalizeDesign } from '@/lib/gilyonotDesign'

// תבניות שמורות למייל הגיליון: גוף, עיצוב ונושא. נשמרות כמו שהן ונטענות לעורך.
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function GET() {
  const staff = await requirePermission('gilyonot', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { data, error } = await db.from('gilyonot_templates')
    .select('id, name, subject, body_html, design, updated_at').order('updated_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: 'טעינת התבניות נכשלה' }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

// שמירה בשם חדש, או עדכון תבנית קיימת כשמגיע id.
export async function POST(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const name = str(body.name, 80)
  if (!name) return NextResponse.json({ error: 'צריך שם לתבנית' }, { status: 400 })
  const row = {
    name,
    subject: str(body.subject, 200) || null,
    body_html: sanitizeMailHtml(body.body_html) || null,
    design: normalizeDesign(body.design),
    updated_at: new Date().toISOString(),
  }
  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null
  const q = id
    ? db.from('gilyonot_templates').update(row).eq('id', id)
    : db.from('gilyonot_templates').insert({ ...row, created_by: staff.userId })
  const { data, error } = await q.select('id, name, subject, body_html, design, updated_at').single()
  if (error || !data) return NextResponse.json({ error: 'שמירת התבנית נכשלה' }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!UUID.test(id)) return NextResponse.json({ error: 'תבנית לא תקינה' }, { status: 400 })
  const { error } = await db.from('gilyonot_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'המחיקה נכשלה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
