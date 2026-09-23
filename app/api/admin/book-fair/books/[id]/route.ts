import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { shekelsToAgorot } from '@/lib/bookFairPricing'
import { logActivity } from '@/lib/activityLog'

// עדכון ומחיקת ספר בקטלוג.
//
// 🔴 המלאי *אינו* נערך כאן. שינוי ישיר של stock_web/stock_phone היה עוקף
// את היומן ושובר את ההתאמה בין העמודה לתנועות. המלאי משתנה אך ורק דרך
// book_fair_adjust_stock ו-book_fair_move_stock (נתיבי /stock).

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function clean(v: unknown): string {
  return String(v ?? '').replace(/[‎‏‪-‮⁦-⁩]/g, '').trim()
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { id } = await params
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}

  if (body.sku !== undefined) {
    const sku = clean(body.sku)
    if (!sku) return NextResponse.json({ error: 'מק"ט אינו יכול להיות ריק' }, { status: 400 })
    patch.sku = sku
  }
  if (body.title !== undefined) {
    const title = clean(body.title)
    if (!title) return NextResponse.json({ error: 'שם הספר אינו יכול להיות ריק' }, { status: 400 })
    patch.title = title
  }
  if (body.price !== undefined) {
    const price = shekelsToAgorot(body.price as string | number)
    if (price === null) return NextResponse.json({ error: 'מחיר לא תקין' }, { status: 400 })
    patch.price_agorot = price
  }
  if (body.volumes !== undefined) {
    const v = Number(body.volumes)
    if (!Number.isInteger(v) || v < 1) return NextResponse.json({ error: 'מספר כרכים לא תקין' }, { status: 400 })
    patch.volumes = v
  }
  if (body.phone_code !== undefined) {
    if (body.phone_code === '' || body.phone_code === null) {
      patch.phone_code = null
    } else {
      const c = Number(body.phone_code)
      if (!Number.isInteger(c) || c <= 0) return NextResponse.json({ error: 'קוד טלפוני לא תקין' }, { status: 400 })
      patch.phone_code = c
    }
  }
  if (body.author !== undefined)      patch.author = clean(body.author) || null
  if (body.publisher !== undefined)   patch.publisher = clean(body.publisher) || null
  if (body.description !== undefined) patch.description = clean(body.description) || null
  if (body.is_active !== undefined)   patch.is_active = body.is_active !== false
  if (body.sort_order !== undefined)  patch.sort_order = Number(body.sort_order) || 0
  if (body.unlimited_stock !== undefined) patch.unlimited_stock = body.unlimited_stock === true

  // 🔴 חסימה מפורשת: ניסיון לערוך מלאי דרך נתיב זה נדחה ואינו מתעלם
  // בשקט — אחרת מסך שנכתב בעתיד "יעדכן מלאי" ולא יקרה כלום.
  if (body.stock_web !== undefined || body.stock_phone !== undefined) {
    return NextResponse.json(
      { error: 'עדכון מלאי מתבצע במסך המלאי בלבד, כדי שכל תנועה תירשם ביומן' },
      { status: 400 }
    )
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
  }

  const { data, error } = await db.from('book_fair_books')
    .update(patch).eq('id', id).select('id, sku, title').single()

  if (error) {
    if (error.code === '23505') {
      const msg = error.message.includes('phone_code')
        ? 'הקוד הטלפוני כבר משויך לספר אחר'
        : 'מק"ט זה כבר קיים בקטלוג'
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    console.error('[book-fair/books] update failed:', error)
    return NextResponse.json({ error: 'עדכון הספר נכשל' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 })

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'book_fair_book',
    entityId: id, details: { fields: Object.keys(patch) },
  })

  return NextResponse.json({ ok: true, book: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('book_fair', 'delete')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { id } = await params

  // 🔴 ספר ששוריין כרגע אינו נמחק: מחיקה תגרור את השריונים ב-cascade,
  // והמלאי לעולם לא יוחזר — הלקוח שבאמצע רכישה יאבד את העגלה בלי הסבר.
  const { count: held } = await db.from('book_fair_reservations')
    .select('id', { count: 'exact', head: true })
    .eq('book_id', id).eq('status', 'held')

  if (held && held > 0) {
    return NextResponse.json(
      { error: `לא ניתן למחוק — ${held} עותקים משוריינים כרגע בעגלות פעילות. נסו שוב בעוד מספר דקות, או סמנו את הספר כלא פעיל.` },
      { status: 409 }
    )
  }

  // ⚠️ שורות ההזמנה שורדות את המחיקה (on delete set null + צילום מצב של
  // השם והמחיר), ולכן היסטוריית ההזמנות נשארת שלמה וקריאה.
  const { error } = await db.from('book_fair_books').delete().eq('id', id)
  if (error) {
    console.error('[book-fair/books] delete failed:', error)
    return NextResponse.json({ error: 'מחיקת הספר נכשלה' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'delete', entityType: 'book_fair_book', entityId: id,
  })

  return NextResponse.json({ ok: true })
}
