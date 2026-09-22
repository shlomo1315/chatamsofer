'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, Globe, Phone, AlertTriangle, Clock, CheckCircle2, Package, Truck, Mic } from 'lucide-react'
import type { BookFairOrder, BookFairOrderStatus } from '@/types/bookFair'
import {
  BOOK_FAIR_STATUS_LABELS, BOOK_FAIR_STATUS_COLORS,
  BOOK_FAIR_CHANNEL_LABELS, BOOK_FAIR_DELIVERY_LABELS,
} from '@/types/bookFair'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { useTablePagination } from '@/lib/useTablePagination'
import Pagination from '@/components/ui/Pagination'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'

type ColKey = 'order_number' | 'customer' | 'channel' | 'items' | 'delivery' | 'total' | 'status' | 'created'

const HEAD = 'px-3 py-3 text-xs font-semibold text-slate-500'

// 🔴 value() חובה בכל עמודה שמרנדרת JSX — בלעדיה המיון עובד על אובייקט
// React ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
//
// ⚠️ filterable רק לקבוצות ערכים סגורות (ערוץ, אופן מסירה, סטטוס) —
// לא לשם או למספר הזמנה, שערכם ייחודי כמעט בכל שורה.
//
// ⚠️ שם וטלפון מאוחדים לתא אחד, ותאריך מוסתר במסכים צרים:
// הגלילה לרוחב אסורה ונאכפת בלינט, והטבלה הזו רחבה מטבעה.
function columnsOf(counts: Record<string, number>): ColDef<ColKey, BookFairOrder>[] {
  return [
    { key: 'order_number', label: 'מספר', def: true, headClassName: HEAD, weight: 1,
      value: o => o.order_number },
    { key: 'customer', label: 'לקוח', def: true, headClassName: HEAD, weight: 2,
      value: o => o.customer_name ?? null },
    { key: 'channel', label: 'ערוץ', def: true, kind: 'enum', filterable: true, headClassName: HEAD,
      // ⚠️ הערך הוא התווית המוצגת ולא הקוד: המשתמש מסנן לפי מה שהוא רואה
      value: o => BOOK_FAIR_CHANNEL_LABELS[o.channel] },
    { key: 'items', label: 'ספרים', def: true, kind: 'number', headClassName: HEAD,
      value: o => counts[o.id] ?? 0 },
    { key: 'delivery', label: 'מסירה', def: true, kind: 'enum', filterable: true, headClassName: HEAD,
      value: o => BOOK_FAIR_DELIVERY_LABELS[o.delivery_method] },
    { key: 'total', label: 'סכום', def: true, kind: 'number', headClassName: HEAD,
      value: o => o.total_agorot },
    { key: 'status', label: 'סטטוס', def: true, kind: 'enum', filterable: true, headClassName: HEAD,
      value: o => BOOK_FAIR_STATUS_LABELS[o.status] },
    { key: 'created', label: 'תאריך', def: true, kind: 'date', headClassName: HEAD,
      value: o => o.created_at },
  ]
}

/** כרטיסי הסינון המהיר — מה שהצוות צריך לראות ביום עבודה. */
const CARDS: { key: BookFairOrderStatus | 'all' | 'needs_address'; label: string; icon: typeof Clock; cls: string }[] = [
  { key: 'all',            label: 'הכל',              icon: Package,       cls: 'border-slate-200 text-slate-600' },
  { key: 'paid',           label: 'שולם — לליקוט',     icon: CheckCircle2,  cls: 'border-emerald-200 text-emerald-700' },
  { key: 'needs_address',  label: 'ממתין לאימות כתובת', icon: Mic,          cls: 'border-purple-200 text-purple-700' },
  { key: 'picking',        label: 'בליקוט',            icon: Package,       cls: 'border-sky-200 text-sky-700' },
  { key: 'shipped',        label: 'נשלח',              icon: Truck,         cls: 'border-violet-200 text-violet-700' },
  { key: 'payment_mismatch', label: 'אי-התאמה בסכום',  icon: AlertTriangle, cls: 'border-red-200 text-red-700' },
]

export default function OrdersClient({ orders, itemCounts }: {
  orders: BookFairOrder[]
  itemCounts: Record<string, number>
}) {
  const [query, setQuery] = useState('')
  const [card, setCard] = useState<typeof CARDS[number]['key']>('all')

  const COLUMNS = useMemo(() => columnsOf(itemCounts), [itemCounts])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length }
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1
    // ⚠️ "ממתין לאימות כתובת" אינו סטטוס אלא תנאי: הזמנה טלפונית
    // למשלוח שהכתובת בה הוקלטה וטרם הוקלדה במשרד.
    c.needs_address = orders.filter(o =>
      o.delivery_method === 'shipping' && !o.address_confirmed && o.status !== 'cancelled' && o.status !== 'failed'
    ).length
    return c
  }, [orders])

  const filtered = useMemo(() => {
    let rows = orders
    if (card === 'needs_address') {
      rows = rows.filter(o =>
        o.delivery_method === 'shipping' && !o.address_confirmed && o.status !== 'cancelled' && o.status !== 'failed'
      )
    } else if (card !== 'all') {
      rows = rows.filter(o => o.status === card)
    }

    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(o =>
      o.order_number.toLowerCase().includes(q) ||
      (o.customer_name ?? '').toLowerCase().includes(q) ||
      (o.customer_phone ?? '').includes(q) ||
      (o.customer_email ?? '').toLowerCase().includes(q)
    )
  }, [orders, card, query])

  // 🔴 הסדר חובה: useTableColumns קודם (מסנן וממיין), ורק אז הדפדוף
  // על התוצאה. חיתוך לעמוד לפני סינון היה מציג עמוד ריק על סינון תקין.
  const tc = useTableColumns<ColKey, BookFairOrder>('book_fair_orders', COLUMNS, {
    sortFilter: { mode: 'client', rows: filtered },
  })
  const pg = useTablePagination(tc.rows)

  const revenue = useMemo(
    // ⚠️ רק הזמנות ששולמו בפועל, בניכוי זיכויים — לא סך ההזמנות.
    // הזמנה שלא שולמה אינה הכנסה.
    () => orders
      .filter(o => ['paid', 'picking', 'packed', 'shipped', 'delivered', 'partially_refunded'].includes(o.status))
      .reduce((s, o) => s + o.total_agorot - o.refunded_agorot, 0),
    [orders]
  )

  return (
    <div className="flex flex-col gap-4">
      {/* ── כרטיסי סינון ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {CARDS.map(({ key, label, icon: Icon, cls }) => {
          const n = counts[key] ?? 0
          const active = card === key
          return (
            <button
              key={key}
              onClick={() => setCard(key)}
              className={`flex flex-col gap-1 rounded-xl border-2 bg-white p-3 text-right transition ${cls} ${
                active ? 'ring-2 ring-offset-1 ring-slate-300' : 'hover:bg-slate-50'
              } ${n === 0 && key !== 'all' ? 'opacity-50' : ''}`}
            >
              <Icon size={16} />
              <span className="text-xl font-bold tabular-nums text-slate-900">{n}</span>
              <span className="text-xs leading-tight">{label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="חיפוש לפי מספר הזמנה, שם, טלפון או אימייל…"
            className="w-full rounded-xl border border-slate-200 py-2 pr-9 pl-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        {tc.picker}
        {tc.activeFilters}
        <span className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
          הכנסות: {fmtAgorot(revenue)}
        </span>
      </div>

      {/* ⚠️ בלי overflow-x: הגלילה לרוחב אסורה ונאכפת בלינט */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <table className="w-full table-fixed">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>{tc.shown.map((c, i) => tc.th(c, i))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pg.rows.map(o => (
              <tr key={o.id} className="text-sm transition hover:bg-slate-50">
                {tc.shown.map(col => (
                  <td key={col.key} className={`px-3 py-2.5 ${tc.cellClass(col)}`}>
                    {renderCell(col.key, o, itemCounts)}
                  </td>
                ))}
              </tr>
            ))}
            {!pg.rows.length && (
              <tr>
                <td colSpan={tc.shown.length} className="px-4 py-12 text-center text-sm text-slate-400">
                  {orders.length ? 'אין הזמנות בסינון זה' : 'טרם התקבלו הזמנות'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination page={pg.page} size={pg.size} total={pg.total} onPage={pg.setPage} onSize={pg.setSize} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function renderCell(key: ColKey, o: BookFairOrder, counts: Record<string, number>) {
  switch (key) {
    case 'order_number':
      return (
        <Link
          href={`/admin/book-fair/orders/${o.id}`}
          className="font-mono text-xs font-semibold text-indigo-700 hover:underline"
        >
          {o.order_number}
        </Link>
      )

    // ⚠️ שם וטלפון בתא אחד: הטבלה רחבה מטבעה והגלילה לרוחב אסורה
    case 'customer':
      return (
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900" title={o.customer_name ?? ''}>
            {o.customer_name || '—'}
          </div>
          {o.customer_phone && (
            <div className="truncate font-mono text-xs text-slate-500" dir="ltr">{o.customer_phone}</div>
          )}
        </div>
      )

    case 'channel':
      return (
        <span className="inline-flex items-center gap-1 text-slate-600">
          {o.channel === 'web' ? <Globe size={13} /> : <Phone size={13} />}
          <span className="text-xs">{BOOK_FAIR_CHANNEL_LABELS[o.channel]}</span>
        </span>
      )

    case 'items':
      return <span className="tabular-nums">{counts[o.id] ?? 0}</span>

    case 'delivery':
      return (
        <div className="min-w-0">
          <div className="text-xs text-slate-700">{BOOK_FAIR_DELIVERY_LABELS[o.delivery_method]}</div>
          {/* 🔴 התג הזה הוא התור שהמשרד עובד לפיו: הזמנה טלפונית
              למשלוח שהכתובת בה עדיין לא הוקלדה מההקלטה. */}
          {o.delivery_method === 'shipping' && !o.address_confirmed && (
            <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-[11px] font-medium text-purple-700">
              <Mic size={10} /> כתובת בהקלטה
            </span>
          )}
        </div>
      )

    case 'total':
      return (
        <div className="tabular-nums">
          <span className="font-medium">{fmtAgorot(o.total_agorot)}</span>
          {o.refunded_agorot > 0 && (
            <div className="text-xs text-orange-600">זוכה {fmtAgorot(o.refunded_agorot)}</div>
          )}
        </div>
      )

    case 'status':
      return (
        <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${BOOK_FAIR_STATUS_COLORS[o.status]}`}>
          {BOOK_FAIR_STATUS_LABELS[o.status]}
        </span>
      )

    case 'created':
      return (
        <span className="whitespace-nowrap text-xs text-slate-500">
          {new Date(o.created_at).toLocaleDateString('he-IL')}
        </span>
      )
  }
}
