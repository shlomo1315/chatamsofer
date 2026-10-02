import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'

// פניות שהושארו בשלוחה הטלפונית.
//
// ⚠️ ההקלטה היא העיקר: התמלול תלוי במנוע חיצוני שטרם נבחר, ולכן
// transcript עשוי להיות ריק. פנייה בלי תמלול היא פנייה שלמה.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'view')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  // ⚠️ ברירת המחדל "פתוחות": זה התור לעבודה. ההיסטוריה זמינה בבקשה.
  const showHandled = request.nextUrl.searchParams.get('all') === '1'

  let q = db.from('book_fair_inquiries')
    .select('id, phone, recording, transcript, handled_at, note, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (!showHandled) q = q.is('handled_at', null)

  const { data, error } = await q
  if (error) {
    console.error('[fair/inquiries] fetch failed:', error.message)
    return NextResponse.json({ error: 'טעינת הפניות נכשלה' }, { status: 500 })
  }

  return NextResponse.json(
    { inquiries: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/** סימון כטופלה / ביטול הסימון / עדכון הערה. */
export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: { id?: string; handled?: boolean; note?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.handled !== undefined) {
    // ⚠️ ביטול הסימון מאפס גם את המטפל — אחרת נשאר שם של מי שלא טיפל.
    patch.handled_at = body.handled ? new Date().toISOString() : null
    patch.handled_by = body.handled ? staff.userId : null
  }
  if (body.note !== undefined) patch.note = String(body.note).trim() || null

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
  }

  const { error } = await db.from('book_fair_inquiries').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
