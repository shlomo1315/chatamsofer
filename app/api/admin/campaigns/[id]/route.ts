import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient, forbidden } from '@/lib/apiAuth'

// טעינה / עדכון / מחיקה של קמפיין.
export const dynamic = 'force-dynamic'

// שדות שמותר לעדכן — whitelist מפורש
const EDITABLE = [
  'name', 'subject', 'preheader', 'from_department',
  'content', 'content_mode', 'raw_html', 'segment', 'scheduled_at',
] as const

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await db.from('campaigns').select('*').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'הקמפיין לא נמצא' }, { status: 404 })

  return NextResponse.json({ campaign: data })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // קמפיין שכבר נשלח או בשליחה — לא ניתן לערוך
  const { data: current } = await db.from('campaigns').select('status').eq('id', id).maybeSingle()
  if (!current) return NextResponse.json({ error: 'הקמפיין לא נמצא' }, { status: 404 })
  if (['sending', 'sent'].includes(current.status)) {
    return NextResponse.json({ error: 'לא ניתן לערוך קמפיין שכבר נשלח' }, { status: 400 })
  }

  let payload: Record<string, unknown>
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of EDITABLE) {
    if (key in payload) patch[key] = payload[key]
  }

  const { error } = await db.from('campaigns').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // קמפיין בשליחה — חייבים לעצור קודם
  const { data: current } = await db.from('campaigns').select('status').eq('id', id).maybeSingle()
  if (current?.status === 'sending') {
    return NextResponse.json({ error: 'יש לעצור את הקמפיין לפני מחיקה' }, { status: 400 })
  }

  const { error } = await db.from('campaigns').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
