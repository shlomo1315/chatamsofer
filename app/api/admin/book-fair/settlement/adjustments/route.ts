import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

// התאמה ידנית של "נמכר" לספר — בלי לשנות הזמנות ובלי זיכוי.
// POST { bookId, delta (שלם, לא 0), reason }
//
// 🔴 הסכום מחושב כאן ולא נשלח מהלקוח: delta × מחיר הספר בקטלוג כרגע.
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 }) }

  const bookId = String(body.bookId ?? '')
  const delta = Number(body.delta)
  const reason = String(body.reason ?? '').trim().slice(0, 300)
  if (!UUID_RE.test(bookId)) return NextResponse.json({ error: 'מזהה ספר לא תקין' }, { status: 400 })
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10000) {
    return NextResponse.json({ error: 'השינוי חייב להיות מספר שלם שאינו 0' }, { status: 400 })
  }
  if (!reason) return NextResponse.json({ error: 'חסרה סיבה' }, { status: 400 })

  const { data: book } = await db.from('book_fair_books').select('id, title, price_agorot').eq('id', bookId).maybeSingle()
  if (!book) return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 })

  const amount = delta * (book.price_agorot ?? 0)
  const { data, error } = await db.from('book_fair_sold_adjustments').insert({
    book_id: bookId, delta, amount_agorot: amount, reason, created_by: staff.userId,
  }).select('id').single()
  if (error) {
    console.error('[book-fair/settlement] adjustment insert failed:', error)
    return NextResponse.json({ error: 'שמירת ההתאמה נכשלה' }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'book_fair_sold_adjust',
    entityType: 'book_fair_book', entityId: bookId,
    details: { title: book.title, delta, amount_agorot: amount, reason, adjustment_id: data.id },
  })
  return NextResponse.json({ ok: true })
}
