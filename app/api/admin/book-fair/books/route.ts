import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { shekelsToAgorot } from '@/lib/bookFairPricing'
import { logActivity } from '@/lib/activityLog'

// ניהול קטלוג יריד הספרים — יצירה ועדכון.
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** שדות טקסט — ניקוי תווי כיווניות בלתי נראים שמגיעים מהדבקה. */
function clean(v: unknown): string {
  return String(v ?? '').replace(/[‎‏‪-‮⁦-⁩]/g, '').trim()
}

/** מספר שלם אי-שלילי, או null אם פסול. */
function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : null
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'add')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 }) }

  const sku = clean(body.sku)
  const title = clean(body.title)
  if (!sku)   return NextResponse.json({ error: 'חסר מק"ט' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'חסר שם ספר' }, { status: 400 })

  // ⚠️ המחיר מגיע בשקלים מהטופס ונשמר באגורות. ההמרה בנקודה אחת בלבד.
  const price = shekelsToAgorot(body.price as string | number)
  if (price === null) return NextResponse.json({ error: 'מחיר לא תקין' }, { status: 400 })

  const volumes = intOrNull(body.volumes ?? 1)
  if (volumes === null || volumes < 1) return NextResponse.json({ error: 'מספר כרכים לא תקין' }, { status: 400 })

  const stockWeb = intOrNull(body.stock_web ?? 0)
  const stockPhone = intOrNull(body.stock_phone ?? 0)
  if (stockWeb === null || stockPhone === null) {
    return NextResponse.json({ error: 'מלאי לא תקין' }, { status: 400 })
  }

  const phoneCode = body.phone_code === '' || body.phone_code === null || body.phone_code === undefined
    ? null : intOrNull(body.phone_code)
  if (body.phone_code && phoneCode === null) {
    return NextResponse.json({ error: 'קוד טלפוני לא תקין' }, { status: 400 })
  }

  const { data, error } = await db.from('book_fair_books').insert({
    sku, title,
    author:    clean(body.author) || null,
    publisher: clean(body.publisher) || null,
    description: clean(body.description) || null,
    volumes,
    price_agorot: price,
    stock_web: stockWeb,
    stock_phone: stockPhone,
    phone_code: phoneCode,
    is_active: body.is_active !== false,
  }).select('id, sku, title').single()

  if (error) {
    // ⚠️ הודעה בעברית לשתי ההתנגשויות הצפויות, במקום שגיאת מסד גולמית
    if (error.code === '23505') {
      const msg = error.message.includes('phone_code')
        ? 'הקוד הטלפוני כבר משויך לספר אחר'
        : 'מק"ט זה כבר קיים בקטלוג'
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    console.error('[book-fair/books] insert failed:', error)
    return NextResponse.json({ error: 'שמירת הספר נכשלה' }, { status: 500 })
  }

  // ⚠️ מלאי התחלתי נרשם ביומן כדי שההתאמה בין העמודה ליומן תחזיק
  // מהרגע הראשון — אחרת מסך ההתאמה יתריע על כל ספר חדש.
  const ledger = []
  if (stockWeb > 0)   ledger.push({ book_id: data.id, channel: 'web',   delta: stockWeb,   reason: 'restock', note: 'מלאי התחלתי', created_by: staff.userId })
  if (stockPhone > 0) ledger.push({ book_id: data.id, channel: 'phone', delta: stockPhone, reason: 'restock', note: 'מלאי התחלתי', created_by: staff.userId })
  if (ledger.length) await db.from('book_fair_stock_ledger').insert(ledger)

  await logActivity(db, {
    userId: staff.userId, action: 'create', entityType: 'book_fair_book',
    entityId: data.id, details: { sku, title },
  })

  return NextResponse.json({ ok: true, book: data })
}
