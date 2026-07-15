import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'

// עריכה / מחיקה של חבר בודד בקבוצה.
export const dynamic = 'force-dynamic'

// PATCH — עריכת פרטי חבר (מייל / שם / עיר / טלפון)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const { id, memberId } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const email = String(body.email ?? '').toLowerCase().trim()
  if (!email.includes('@') || !email.includes('.')) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  }

  const data = {
    family_name: String(body.family_name ?? '').trim(),
    full_name: String(body.full_name ?? '').trim(),
    city: String(body.city ?? '').trim(),
    phone: String(body.phone ?? '').trim(),
    email,
  }

  const { error } = await db
    .from('contacts')
    .update({ email, data })
    .eq('id', memberId)
    .eq('list_id', id)   // הגנה: החבר חייב להשתייך לקבוצה שבנתיב

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return NextResponse.json({ error: 'הכתובת כבר קיימת בקבוצה' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE — הסרת חבר מהקבוצה
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const ctx = await requirePermission('newsletter', 'edit')
  if (!ctx) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const { id, memberId } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { error } = await db
    .from('contacts')
    .delete()
    .eq('id', memberId)
    .eq('list_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
