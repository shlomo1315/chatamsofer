import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'

// ניהול קבוצה בודדת (contact_list): פרטים, שינוי שם, מחיקה.
export const dynamic = 'force-dynamic'

// GET — פרטי הקבוצה + מספר החברים
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'view')
  if (!ctx) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: list, error } = await db
    .from('contact_lists')
    .select('id, name, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!list) return NextResponse.json({ error: 'הקבוצה לא נמצאה' }, { status: 404 })

  const { count } = await db
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', id)

  return NextResponse.json({ group: { ...list, count: count ?? 0 } })
}

// PATCH — שינוי שם הקבוצה
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { name?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const name = String(body?.name ?? '').trim().slice(0, 100)
  if (!name) return NextResponse.json({ error: 'יש לתת שם לקבוצה' }, { status: 400 })

  const { error } = await db.from('contact_lists').update({ name }).eq('id', id)
  if (error) {
    // שם ייחודי — הודעה ידידותית במקום שגיאת DB גולמית
    if (/duplicate|unique/i.test(error.message)) {
      return NextResponse.json({ error: 'כבר קיימת קבוצה בשם הזה' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE — מחיקת הקבוצה (החברים נמחקים אוטומטית ב-cascade)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { error } = await db.from('contact_lists').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
