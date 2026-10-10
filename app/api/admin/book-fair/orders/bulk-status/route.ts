import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { bookFairStatusUpdateEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import {
  detectColumns, isHeader, planRows, checkTransition, checkAddress, normCity,
  type OrderInfo, type DetectedColumns, type CityRef,
} from '@/lib/bookFairBulkStatus'
import type { BookFairOrderStatus } from '@/types/bookFair'

// עדכון סטטוסים מאקסל (10.10).
//   POST multipart {file, orderCol?, statusCol?} → תצוגה מקדימה (לא משנה דבר)
//   PUT  JSON {changes:[{order_number,status}], sendMail}  → ביצוע
//
// ⚠️ כל נתיב מגן על עצמו: ה-middleware אינו מכסה /api כלל.
//
// 🔴 הביצוע אינו סומך על התצוגה המקדימה: כל שורה נבדקת שוב מול המצב
// *העדכני* במסד, והעדכון מותנה בסטטוס שנבדק (eq status). הזמנה ששונתה
// בין התצוגה לאישור — לא נדרסת, ומדווחת כ"לא נקלטה".

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_BYTES = 5 * 1024 * 1024
const MAILED: BookFairOrderStatus[] = ['picking', 'packed', 'shipped', 'delivered']

type OrderRow = OrderInfo & { id: string; order_number: string; status: BookFairOrderStatus }

async function loadOrders(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { rows } = await fetchAllRows<OrderRow>(
    (from, to) => db.from('book_fair_orders')
      .select('id, order_number, status, delivery_method, address_text, city_id')
      .range(from, to) as unknown as PromiseLike<{ data: OrderRow[] | null; error: { message: string } | null }>
  )
  return new Map(rows.map(r => [String(r.order_number), r]))
}

async function loadCities(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { data } = await db.from('book_fair_cities').select('id, name')
  return new Map<string, CityRef>((data ?? []).map(c => [normCity(c.name), { id: String(c.id), name: String(c.name) }]))
}

function colName(i: number): string {
  let s = '', n = i + 1
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}

// ── תצוגה מקדימה ──
export async function POST(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'edit'))) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'לא התקבל קובץ' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'הקובץ גדול מדי (מעל 5MB)' }, { status: 400 })

  const rows: unknown[][] = []
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    if (!ws) return NextResponse.json({ error: 'הקובץ אינו מכיל גיליון' }, { status: 400 })
    ws.eachRow({ includeEmpty: true }, row => {
      const values = row.values as unknown[]
      // ⚠️ 1-based עם חור בתא 0; נוסחה/קישור/טקסט עשיר — לוקחים את הערך.
      rows.push(values.slice(1).map(v => {
        if (v && typeof v === 'object' && !(v instanceof Date)) {
          const o = v as Record<string, unknown>
          if ('result' in o) return o.result
          if ('text' in o) return o.text
          if ('richText' in o) return (o.richText as { text: string }[]).map(t => t.text).join('')
        }
        return v
      }))
    })
  } catch (e) {
    console.error('[book-fair/bulk-status] read failed:', e)
    return NextResponse.json({ error: 'קריאת הקובץ נכשלה. ודאו שזהו קובץ אקסל (xlsx)' }, { status: 400 })
  }
  if (!rows.length) return NextResponse.json({ error: 'הקובץ ריק' }, { status: 400 })

  const orders = await loadOrders(db)
  const known = new Set(orders.keys())
  const width = Math.max(...rows.map(r => r.length))

  // עקיפה ידנית מהמסך, כשהזיהוי האוטומטי טעה. ‎-1 = אין עמודה כזו.
  const pick = (k: string) => {
    const raw = form?.get(k)
    if (raw === null || raw === undefined || raw === '') return null
    const n = Number(raw)
    return Number.isInteger(n) && n >= -1 && n < width ? n : null
  }
  const manual = { orderCol: pick('orderCol'), statusCol: pick('statusCol'), addressCol: pick('addressCol'), cityCol: pick('cityCol') }
  let cols: DetectedColumns | null = detectColumns(rows, known)
  if (manual.orderCol !== null && manual.orderCol >= 0) {
    const c = {
      orderCol: manual.orderCol,
      statusCol: manual.statusCol ?? -1,
      addressCol: manual.addressCol ?? -1,
      cityCol: manual.cityCol ?? -1,
    }
    cols = c.statusCol < 0 && c.addressCol < 0 ? null
      : { ...c, headerRow: isHeader(rows[0], c.orderCol, c.statusCol, known) }
  }

  // כותרות לבורר העמודות במסך.
  const headerCells = rows[0] ?? []
  const columns = Array.from({ length: width }, (_, i) => {
    const h = String(headerCells[i] ?? '').trim()
    return { index: i, label: `עמודה ${colName(i)}${h ? ` — ${h.slice(0, 30)}` : ''}` }
  })

  if (!cols) {
    return NextResponse.json({
      error: 'לא זוהו בקובץ עמודה של מספרי הזמנה קיימים ועמודה של סטטוס או כתובת. בחרו את העמודות ידנית.',
      columns,
    }, { status: 422 })
  }

  const plan = planRows(rows, cols, orders as Map<string, OrderInfo>, await loadCities(db))

  return NextResponse.json({ cols, columns, plan })
}

// ── ביצוע ──
export async function PUT(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: { changes?: unknown; sendMail?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }
  type Change = { order_number?: unknown; status?: unknown; address?: unknown; city_id?: unknown }
  const changes = Array.isArray(body.changes) ? body.changes as Change[] : []
  if (!changes.length) return NextResponse.json({ error: 'אין שינויים לביצוע' }, { status: 400 })
  if (changes.length > 5000) return NextResponse.json({ error: 'יותר מדי שורות' }, { status: 400 })

  const orders = await loadOrders(db)
  const cityIds = new Set([...(await loadCities(db)).values()].map(c => c.id))
  const failed: { order_number: string; error: string }[] = []
  let statusChanged = 0, addressChanged = 0
  const mailQueue: { id: string; status: BookFairOrderStatus }[] = []

  // ⚠️ שורה-שורה ולא קבוצתית: כל שורה עשויה לשנות סטטוס, כתובת או שניהם,
  // והעדכון מותנה בסטטוס שנבדק (eq status) — הזמנה ששונתה בינתיים בכרטיס
  // אינה נדרסת. כמה מאות שורות = שניות ספורות.
  for (const c of changes) {
    const num = String(c.order_number ?? '').trim()
    const o = orders.get(num)
    if (!o) { failed.push({ order_number: num, error: 'מספר הזמנה לא קיים' }); continue }

    const patch: Record<string, unknown> = {}
    const to = c.status ? String(c.status) as BookFairOrderStatus : null
    if (to && to !== o.status) {
      const err = checkTransition(o.status, to)
      if (err) { failed.push({ order_number: num, error: err }); continue }
      patch.status = to
    }

    const address = c.address ? String(c.address).replace(/\s+/g, ' ').trim() : ''
    if (address) {
      const err = checkAddress(o, address)
      if (err) { failed.push({ order_number: num, error: err }); continue }
      patch.address_text = address
      // 🔴 כתובת מקובץ היא כתובת מאומתת — המשרד הוא שהכין אותה. בלי זה
      // ההזמנה נשארת בתור "כתובת ממתינה" למרות שהכתובת עודכנה.
      patch.address_confirmed = true
      if (c.city_id) {
        if (!cityIds.has(String(c.city_id))) { failed.push({ order_number: num, error: 'עיר לא מוכרת' }); continue }
        patch.city_id = String(c.city_id)
      }
    }

    if (!Object.keys(patch).length) { failed.push({ order_number: num, error: 'אין מה לשנות' }); continue }
    patch.updated_at = new Date().toISOString()

    const { data, error } = await db.from('book_fair_orders')
      .update(patch).eq('id', o.id).eq('status', o.status).select('id')
    if (error) { console.error('[book-fair/bulk-status] update failed:', error); failed.push({ order_number: num, error: 'שגיאת מסד' }); continue }
    if (!data?.length) { failed.push({ order_number: num, error: 'הסטטוס השתנה בינתיים — לא נדרס' }); continue }

    if (patch.status) { statusChanged++; mailQueue.push({ id: o.id, status: patch.status as BookFairOrderStatus }) }
    if (patch.address_text) addressChanged++
  }

  const changed = changes.length - failed.length
  await logActivity(db, {
    userId: staff.userId, action: 'book_fair_bulk_status', entityType: 'book_fair_order',
    details: { requested: changes.length, changed, statusChanged, addressChanged, failed: failed.length },
  })

  // ── מיילים ללקוחות — רק אם סומן במסך ──
  // ⚠️ ברקע ובזה אחר זה: Resend מגביל קצב, והמשרד לא אמור להמתין.
  if (body.sendMail === true) {
    const toMail = mailQueue.filter(c => MAILED.includes(c.status))
    void (async () => {
      try {
        await ensureEmailTexts()
        for (const c of toMail) {
          const { data: full } = await db.from('book_fair_orders')
            .select('order_number, customer_name, customer_email, delivery_method, tracking_token')
            .eq('id', c.id).maybeSingle()
          if (!full?.customer_email) continue
          const mail = bookFairStatusUpdateEmail({
            orderNumber: full.order_number as string,
            customerName: full.customer_name as string | null,
            status: c.status,
            deliveryMethod: full.delivery_method === 'pickup' ? 'pickup' : 'shipping',
            trackingToken: full.tracking_token as string | null,
          })
          const sent = await deliverMail(full.customer_email as string, mail.subject, mail.html, undefined,
            { ...mailFor('yerid'), transactional: true })
          if (!sent.ok) console.error(`[book-fair/bulk-status] מייל ל-${full.order_number} נכשל:`, sent.error)
        }
      } catch (e) {
        console.error('[book-fair/bulk-status] מיילים נכשלו:', e)
      }
    })()
  }

  return NextResponse.json({ ok: true, changed, statusChanged, addressChanged, failed })
}
