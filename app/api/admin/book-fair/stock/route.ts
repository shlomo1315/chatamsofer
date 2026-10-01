import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'

// תנועות מלאי — הנתיב היחיד שדרכו המלאי משתנה.
//
// 🔴 פעולה אחת — adjust (קבלת סחורה, ספירת מלאי) — והיא עוברת דרך
// פונקציית המסד ולא דרך UPDATE ישיר: הפונקציה אטומית ורושמת ביומן,
// ו-UPDATE ישיר היה עוקף את שניהם.
//
// ⚠️ 'move' הוסרה: מאז מיגרציית 20261001 המלאי משותף לאתר ולטלפון,
// ואין בין מה למה להעביר.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** תרגום שגיאות המסד להודעות בעברית. */
function translateError(message: string): { error: string; status: number } {
  if (message.includes('insufficient_stock')) {
    return { error: 'אין מספיק מלאי', status: 409 }
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

  // ⚠️ תשובה מפורשת ולא "פעולה לא מוכרת": לקוח ישן ששולח move צריך
  // לדעת *למה* זה נדחה.
  if (op === 'move') {
    return NextResponse.json(
      { error: 'המלאי משותף לאתר ולטלפון — אין העברה בין ערוצים' },
      { status: 400 }
    )
  }

  // ── תיקון ידני ──
  if (op === 'adjust') {
    // ⚠️ הערוץ נרשם ביומן בלבד ואינו בוחר עמודה — המלאי אחד.
    const channel = String(body.channel ?? 'web')
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
