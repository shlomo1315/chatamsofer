import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

// תנועות מלאי — הנתיב היחיד שדרכו המלאי משתנה.
//
// 🔴 שתי פעולות, ושתיהן עוברות דרך פונקציות המסד ולא דרך UPDATE ישיר:
//   move   — העברה בין ערוצים (הדרך היחידה לחצות את ההפרדה הקשיחה)
//   adjust — תיקון ידני (קבלת סחורה, ספירת מלאי)
//
// הפונקציות אטומיות ורושמות ביומן. UPDATE ישיר היה עוקף את שניהם.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** תרגום שגיאות המסד להודעות בעברית. */
function translateError(message: string): { error: string; status: number } {
  if (message.includes('insufficient_stock')) {
    return { error: 'אין מספיק מלאי בערוץ המקור', status: 409 }
  }
  if (message.includes('bad_channels') || message.includes('bad_channel')) {
    return { error: 'ערוץ לא תקין', status: 400 }
  }
  if (message.includes('bad_quantity') || message.includes('zero_delta')) {
    return { error: 'כמות לא תקינה', status: 400 }
  }
  if (message.includes('bad_reason')) {
    return { error: 'סיבת תנועה לא תקינה', status: 400 }
  }
  console.error('[book-fair/stock] unexpected:', message)
  return { error: 'פעולת המלאי נכשלה', status: 500 }
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'גוף בקשה שגוי' }, { status: 400 }) }

  const op = String(body.op ?? '')
  const bookId = String(body.book_id ?? '')
  if (!bookId) return NextResponse.json({ error: 'חסר מזהה ספר' }, { status: 400 })

  // ── העברה בין ערוצים ──
  if (op === 'move') {
    const from = String(body.from ?? '')
    const to = String(body.to ?? '')
    const qty = Number(body.quantity)

    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: 'כמות להעברה חייבת להיות מספר חיובי' }, { status: 400 })
    }

    const { data, error } = await db.rpc('book_fair_move_stock', {
      p_book_id: bookId, p_from: from, p_to: to, p_qty: qty, p_by: staff.userId,
    })

    if (error) {
      const t = translateError(error.message)
      return NextResponse.json({ error: t.error }, { status: t.status })
    }

    await logActivity(db, {
      userId: staff.userId, action: 'stock_move', entityType: 'book_fair_book',
      entityId: bookId, details: { from, to, quantity: qty },
    })

    return NextResponse.json({ ok: true, result: data })
  }

  // ── תיקון ידני ──
  if (op === 'adjust') {
    const channel = String(body.channel ?? '')
    const delta = Number(body.delta)
    const reason = String(body.reason ?? 'adjust')

    if (!Number.isInteger(delta) || delta === 0) {
      return NextResponse.json({ error: 'יש להזין כמות שונה מאפס' }, { status: 400 })
    }

    const { data, error } = await db.rpc('book_fair_adjust_stock', {
      p_book_id: bookId, p_channel: channel, p_delta: delta,
      p_reason: reason, p_note: String(body.note ?? '') || null, p_by: staff.userId,
    })

    if (error) {
      const t = translateError(error.message)
      return NextResponse.json({ error: t.error }, { status: t.status })
    }

    await logActivity(db, {
      userId: staff.userId, action: 'stock_adjust', entityType: 'book_fair_book',
      entityId: bookId, details: { channel, delta, reason },
    })

    return NextResponse.json({ ok: true, stock: data })
  }

  return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
}
