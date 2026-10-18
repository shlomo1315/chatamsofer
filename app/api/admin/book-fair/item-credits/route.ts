import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { parseItemCreditsTable, matchItemCredits, type CreditItem, type CreditOrder } from '@/lib/bookFairItemCredits'
import { logActivity } from '@/lib/activityLog'

// ספרים שזוכו בהזמנות (ברמת מערכת ההזמנות בלבד, בלי כסף ובלי מלאי):
// רשימה (GET), תבנית (GET ?template=1), תצוגה מקדימה וכתיבה מאקסל (POST, כתיבה רק עם confirm=true).

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 3000

export async function GET(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'view')
  if (!staff) return forbidden()

  if (request.nextUrl.searchParams.get('template')) {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('ספרים שזוכו', { views: [{ rightToLeft: true }] })
    ws.columns = [
      { header: 'מספר הזמנה', key: 'o', width: 18 }, { header: 'שם ספר', key: 'b', width: 40 },
      { header: 'כמות', key: 'q', width: 10 },
    ]
    ws.getColumn('o').numFmt = '@'
    ws.getRow(1).font = { bold: true }
    const buf = await wb.xlsx.writeBuffer()
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('תבנית ספרים שזוכו.xlsx')}`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const { data, error } = await db.from('book_fair_item_credits')
    .select('id, order_id, order_number, quantity, source, created_at, item:book_fair_order_items(title_snapshot)')
    .order('created_at', { ascending: false }).limit(2000)
  if (error) return NextResponse.json({ error: 'טעינת הרשימה נכשלה' }, { status: 422 })
  const credits = (data ?? []).map(r => {
    const item = Array.isArray(r.item) ? r.item[0] : r.item
    return { id: r.id, order_id: r.order_id, order_number: r.order_number, quantity: r.quantity, source: r.source, created_at: r.created_at, title: item?.title_snapshot ?? '' }
  })
  return NextResponse.json({ credits })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!form || !(file instanceof File)) return NextResponse.json({ error: 'לא התקבל קובץ' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'הקובץ גדול מדי (מעל 5MB)' }, { status: 400 })
  const confirm = form.get('confirm') === 'true'

  let rows: unknown[][]
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    if (!ws) return NextResponse.json({ error: 'הקובץ אינו מכיל גיליון' }, { status: 400 })
    rows = []
    ws.eachRow({ includeEmpty: true }, row => {
      rows.push((row.values as unknown[]).slice(1).map(v => {
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>
          if ('result' in o) return o.result
          if ('text' in o) return o.text
          if ('richText' in o) return (o.richText as { text: string }[]).map(t => t.text).join('')
        }
        return v
      }))
    })
  } catch {
    return NextResponse.json({ error: 'קריאת הקובץ נכשלה. ודאו שזהו קובץ אקסל תקין (xlsx)' }, { status: 400 })
  }
  if (rows.length > MAX_ROWS + 1) return NextResponse.json({ error: `הקובץ ארוך מדי (מעל ${MAX_ROWS} שורות)` }, { status: 400 })

  const parsed = parseItemCreditsTable(rows)
  if (parsed.missingColumns.length) {
    return NextResponse.json({ error: `חסרות עמודות חובה בקובץ: ${parsed.missingColumns.join(', ')}` }, { status: 400 })
  }

  const numbers = [...new Set(parsed.credits.map(c => c.order_number))]
  const orders: CreditOrder[] = []
  for (let i = 0; i < numbers.length; i += 200) {
    const { data, error } = await db.from('book_fair_orders').select('id, order_number, status').in('order_number', numbers.slice(i, i + 200))
    if (error) return NextResponse.json({ error: 'טעינת ההזמנות נכשלה' }, { status: 422 })
    orders.push(...(data ?? []))
  }
  const items: CreditItem[] = []
  for (let i = 0; i < orders.length; i += 100) {
    const { data, error } = await db.from('book_fair_order_items').select('id, order_id, book_id, title_snapshot, quantity')
      .in('order_id', orders.slice(i, i + 100).map(o => o.id))
    if (error) return NextResponse.json({ error: 'טעינת שורות ההזמנות נכשלה' }, { status: 422 })
    items.push(...(data ?? []))
  }

  const { matched, unmatched } = matchItemCredits(parsed.credits, orders, items)
  const unmatchedAll = [
    ...parsed.errors.map(e => ({ line: e.line, order_number: '', book: '', reason: e.message })),
    ...unmatched,
  ].sort((a, b) => a.line - b.line)
  const summary = { rows: parsed.credits.length, items: matched.length, copies: matched.reduce((s, m) => s + m.quantity, 0), unmatched: unmatchedAll.length }

  if (!confirm) return NextResponse.json({ preview: true, summary, matched: matched.slice(0, 200), unmatched: unmatchedAll })

  if (unmatchedAll.length && form.get('skipErrors') !== 'true') {
    return NextResponse.json({ error: 'בקובץ יש שורות שלא הותאמו. תקנו אותו או אשרו דילוג עליהן', unmatched: unmatchedAll }, { status: 422 })
  }
  if (!matched.length) return NextResponse.json({ error: 'אין שורות תקינות לשמירה' }, { status: 422 })

  const payload = matched.map(m => ({
    order_id: m.order_id, item_id: m.item_id, order_number: m.order_number, book_id: m.book_id,
    quantity: m.quantity, source: 'excel', created_by: staff.userId,
  }))
  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await db.from('book_fair_item_credits').upsert(payload.slice(i, i + 200), { onConflict: 'item_id' })
    if (error) {
      console.error('[book-fair/item-credits] upsert failed', error.code)
      return NextResponse.json({ error: 'השמירה נכשלה באמצע. העלאה חוזרת של אותו קובץ בטוחה (היא קובעת כמויות ולא מוסיפה)', saved: i }, { status: 422 })
    }
  }
  await logActivity(db, { userId: staff.userId, action: 'book_fair_item_credits_import', entityType: 'book_fair_item_credits', details: summary })
  return NextResponse.json({ saved: true, summary })
}
