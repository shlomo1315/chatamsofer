import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import type { BookFairCity } from '@/types/bookFair'

// ערי המשלוח של יריד הספרים — רשימה סגורה.
//
// ⚠️ הרשימה היא גם אימות הכתובת: הלקוח בוחר מתוכה במקום להקליד יעד
// שאיננו משלחים אליו. לכן שם עיר וקוד טלפוני ייחודיים במסד.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** ניקוי תווי כיווניות בלתי נראים שמגיעים מהדבקה מ-Word/אקסל. */
function clean(v: unknown): string {
  return String(v ?? '').replace(/[‎‏‪-‮⁦-⁩]/g, '').trim()
}

/** מספר שלם אי-שלילי, או null כשהשדה ריק או פסול. */
function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** הודעה בעברית להתנגשות ייחודיות, במקום שגיאת מסד גולמית. */
function conflictMessage(message: string): string {
  return message.includes('phone_code')
    ? 'הקוד הטלפוני כבר משויך לעיר אחרת'
    : 'עיר בשם זה כבר קיימת ברשימה'
}

export async function GET(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  // ── ספירת ההזמנות הקשורות לעיר — למסך, לפני אזהרת המחיקה ──
  //
  // ⚠️ פרמטר על GET ולא פועל HTTP חריג: OPTIONS שמורה למשא-ומתן
  // בין-מקורות של הדפדפן, ותשובה חריגה בה עלולה להפריע לו.
  const countFor = clean(new URL(request.url).searchParams.get('countFor'))
  if (countFor) {
    // ⚠️ head:true + count — ספירה בלבד, בלי למשוך את ההזמנות עצמן.
    const { count } = await db
      .from('book_fair_orders')
      .select('id', { count: 'exact', head: true })
      .eq('city_id', countFor)
    return NextResponse.json({ orders: count ?? 0 })
  }

  // ⚠️ אין כאן fetchAllRows: הרשימה סגורה ומכוונת לכמה ערים בודדות,
  // ולעולם לא תתקרב לתקרת 1,000 השורות של PostgREST.
  const { data, error } = await db
    .from('book_fair_cities')
    .select('id, name, phone_code, is_active, sort_order, created_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.error('[book-fair/cities] fetch failed:', error)
    return NextResponse.json({ error: 'טעינת הערים נכשלה' }, { status: 500 })
  }
  return NextResponse.json({ cities: (data ?? []) as BookFairCity[] })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 }) }

  const name = clean(body.name)
  if (!name) return NextResponse.json({ error: 'חסר שם עיר' }, { status: 400 })

  // ⚠️ קוד ריק הוא ערך חוקי (עיר שאינה מוצעת בשלוחה), אבל קוד שהוקלד
  // ואינו מספר שלם הוא טעות שצריכה לעצור את השמירה ולא להישמר כ-null.
  const phoneCode = intOrNull(body.phone_code)
  if (body.phone_code !== '' && body.phone_code !== null && body.phone_code !== undefined && phoneCode === null) {
    return NextResponse.json({ error: 'קוד טלפוני לא תקין' }, { status: 400 })
  }

  const sortOrder = intOrNull(body.sort_order) ?? 0

  const { data, error } = await db.from('book_fair_cities').insert({
    name,
    phone_code: phoneCode,
    is_active: body.is_active !== false,
    sort_order: sortOrder,
  }).select('id, name, phone_code, is_active, sort_order, created_at').single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: conflictMessage(error.message) }, { status: 409 })
    console.error('[book-fair/cities] insert failed:', error)
    return NextResponse.json({ error: 'שמירת העיר נכשלה' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'create', entityType: 'book_fair_city',
    entityId: data.id, details: { name, phone_code: phoneCode },
  })

  return NextResponse.json({ ok: true, city: data as BookFairCity })
}

export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 }) }

  const id = clean(body.id)
  if (!id) return NextResponse.json({ error: 'חסר מזהה עיר' }, { status: 400 })

  // ⚠️ עדכון חלקי: רק שדות שנשלחו נכתבים. שליחת אובייקט מלא מהטופס הייתה
  // דורסת שדות שהמשתמש לא נגע בהם כשהמסך מעדכן רק את המתג "פעיל".
  const patch: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = clean(body.name)
    if (!name) return NextResponse.json({ error: 'שם העיר אינו יכול להיות ריק' }, { status: 400 })
    patch.name = name
  }
  if (body.phone_code !== undefined) {
    const phoneCode = intOrNull(body.phone_code)
    if (body.phone_code !== '' && body.phone_code !== null && phoneCode === null) {
      return NextResponse.json({ error: 'קוד טלפוני לא תקין' }, { status: 400 })
    }
    patch.phone_code = phoneCode
  }
  if (body.is_active !== undefined) patch.is_active = body.is_active !== false
  if (body.sort_order !== undefined) {
    const sortOrder = intOrNull(body.sort_order)
    if (sortOrder === null) return NextResponse.json({ error: 'סדר תצוגה לא תקין' }, { status: 400 })
    patch.sort_order = sortOrder
  }

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })

  const { data, error } = await db
    .from('book_fair_cities')
    .update(patch)
    .eq('id', id)
    .select('id, name, phone_code, is_active, sort_order, created_at')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: conflictMessage(error.message) }, { status: 409 })
    console.error('[book-fair/cities] update failed:', error)
    return NextResponse.json({ error: 'עדכון העיר נכשל' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'העיר לא נמצאה' }, { status: 404 })

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'book_fair_city',
    entityId: id, details: patch,
  })

  return NextResponse.json({ ok: true, city: data as BookFairCity })
}

/**
 * מחיקת עיר.
 *
 * ⚠️ ה-FK מ-book_fair_orders.city_id הוא `on delete set null` — המחיקה לא
 * תיפול, אבל היעד של הזמנות קיימות יתרוקן ולא ניתן יהיה לשחזר אותו.
 * המסך מזהיר על כך לפני האישור; כאן מוחזרת הספירה כדי שההזהרה תהיה מספרית.
 */
export async function DELETE(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const id = clean(new URL(request.url).searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'חסר מזהה עיר' }, { status: 400 })

  // ⚠️ head:true + count — ספירה בלבד, בלי למשוך את ההזמנות עצמן.
  const { count } = await db
    .from('book_fair_orders')
    .select('id', { count: 'exact', head: true })
    .eq('city_id', id)

  const { error } = await db.from('book_fair_cities').delete().eq('id', id)
  if (error) {
    console.error('[book-fair/cities] delete failed:', error)
    return NextResponse.json({ error: 'מחיקת העיר נכשלה' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'delete', entityType: 'book_fair_city',
    entityId: id, details: { detached_orders: count ?? 0 },
  })

  return NextResponse.json({ ok: true, detachedOrders: count ?? 0 })
}
