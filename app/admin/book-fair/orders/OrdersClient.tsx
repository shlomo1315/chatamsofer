'use client'
import { useState, useMemo } from 'react'
import { ilDate, ilTime } from '@/lib/israelTime'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Globe, Phone, AlertTriangle, Clock, CheckCircle2, Package, Truck, Mic, XCircle, Store, Undo2, Banknote, CreditCard } from 'lucide-react'
import type { BookFairOrder, BookFairOrderStatus } from '@/types/bookFair'
import {
  BOOK_FAIR_STATUS_LABELS, BOOK_FAIR_STATUS_COLORS,
  BOOK_FAIR_CHANNEL_LABELS, BOOK_FAIR_DELIVERY_LABELS,
} from '@/types/bookFair'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { useTablePagination } from '@/lib/useTablePagination'
import Pagination from '@/components/ui/Pagination'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'

type ColKey = 'order_number' | 'customer' | 'phone' | 'channel' | 'items' | 'delivery' | 'total' | 'payment' | 'status' | 'created' | 'paid_at'

/**
 * אמצעי התשלום כפי שמוצג ומסונן (בקשת המשתמש 05.10).
 *
 * ⚠️ מזומן קיים רק בדוכן. באתר ובטלפון התשלום תמיד באשראי דרך נדרים,
 * גם כש-payment_method לא נשמר בשורה — ולכן הערוץ קובע כשהשדה ריק.
 */
function paymentLabel(o: BookFairOrder): 'מזומן' | 'אשראי' | '—' {
  if (o.payment_method === 'cash') return 'מזומן'
  if (o.payment_method === 'card') return 'אשראי'
  if (o.channel === 'web' || o.channel === 'phone') return 'אשראי'
  return '—'
}

const HEAD = 'px-3 py-3 text-xs font-semibold text-slate-500'

// 🔴 value() חובה בכל עמודה שמרנדרת JSX — בלעדיה המיון עובד על אובייקט
// React ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
//
// ⚠️ filterable רק לקבוצות ערכים סגורות (ערוץ, אופן מסירה, סטטוס) —
// לא לשם או למספר הזמנה, שערכם ייחודי כמעט בכל שורה.
//
// ⚠️ תאריך מוסתר במסכים צרים: הגלילה לרוחב אסורה ונאכפת בלינט,
// והטבלה הזו רחבה מטבעה.
function columnsOf(counts: Record<string, number>): ColDef<ColKey, BookFairOrder>[] {
  return [
    { key: 'order_number', label: 'מספר', def: true, headClassName: HEAD, weight: 1,
      value: o => o.order_number },
    { key: 'customer', label: 'לקוח', def: true, headClassName: HEAD, weight: 2,
      value: o => o.customer_name ?? null },
    // ⚠️ עמודה משלו ולא בתוך תא הלקוח: הטלפון הוא מה שמחפשים בו
    // בפועל, ומיון לפיו לא היה אפשרי כשהוא נבלע בתוך השם.
    { key: 'phone', label: 'טלפון', def: true, headClassName: HEAD,
      value: o => o.customer_phone ?? null },
    { key: 'channel', label: 'ערוץ', def: true, kind: 'enum', filterable: true, headClassName: HEAD,
      // ⚠️ הערך הוא התווית המוצגת ולא הקוד: המשתמש מסנן לפי מה שהוא רואה
      value: o => BOOK_FAIR_CHANNEL_LABELS[o.channel] },
    { key: 'items', label: 'ספרים', def: true, kind: 'number', headClassName: HEAD,
      value: o => counts[o.id] ?? 0 },
    { key: 'delivery', label: 'מסירה', def: true, kind: 'enum', filterable: true, headClassName: HEAD,
      value: o => BOOK_FAIR_DELIVERY_LABELS[o.delivery_method] },
    { key: 'total', label: 'סכום', def: true, kind: 'number', headClassName: HEAD,
      value: o => o.total_agorot },
    { key: 'payment', label: 'תשלום', def: true, kind: 'enum', filterable: true, headClassName: HEAD,
      value: o => paymentLabel(o) },
    { key: 'status', label: 'סטטוס', def: true, kind: 'enum', filterable: true, headClassName: HEAD,
      value: o => BOOK_FAIR_STATUS_LABELS[o.status] },
    { key: 'created', label: 'תאריך', def: true, kind: 'date', headClassName: HEAD,
      value: o => o.created_at },
    // ⚠️ שעת התשלום ולא שעת היצירה: בטלפון המתקשר מתחיל הזמנה ומשלם
    // דקות אחר כך, ובדוכן הפער גדול אף יותר. "מתי נכנס הכסף" הוא מה
    // שמשווים מול הדוח של נדרים, ו-created_at אינו עונה על זה.
    { key: 'paid_at', label: 'שעת תשלום', def: true, kind: 'date', headClassName: HEAD,
      value: o => o.paid_at ?? null },
  ]
}

/** כרטיסי הסינון המהיר — מה שהצוות צריך לראות ביום עבודה. */
const CARDS: { key: BookFairOrderStatus | 'all' | 'needs_address'; label: string; icon: typeof Clock; cls: string }[] = [
  { key: 'all',            label: 'הכל',              icon: Package,       cls: 'border-slate-200 text-slate-600' },
  { key: 'paid',           label: 'שולם — לליקוט',     icon: CheckCircle2,  cls: 'border-emerald-200 text-emerald-700' },
  { key: 'needs_address',  label: 'ממתין לאימות כתובת', icon: Mic,          cls: 'border-purple-200 text-purple-700' },
  { key: 'picking',        label: 'בליקוט',            icon: Package,       cls: 'border-sky-200 text-sky-700' },
  { key: 'shipped',        label: 'נשלח',              icon: Truck,         cls: 'border-violet-200 text-violet-700' },
  // ⚠️ כולל את מכירות הדוכן — הקונה לוקח את הספרים ביד (בקשת המשתמש 05.10).
  { key: 'delivered',      label: 'נמסר',              icon: CheckCircle2,  cls: 'border-teal-200 text-teal-700' },
  { key: 'payment_mismatch', label: 'אי-התאמה בסכום',  icon: AlertTriangle, cls: 'border-red-200 text-red-700' },
  // ⚠️ כרטיס משלו: אלו אינן הזמנות אלא דפי סליקה שננטשו, והן הסתתרו
  // בתוך "הכל" בלי שאפשר היה לסנן ולנקות אותן.
  { key: 'pending_payment', label: 'ממתין לתשלום',     icon: Clock,         cls: 'border-amber-200 text-amber-700' },
  // ⚠️ "זוכה" הופיע בטבלה אך לא ככרטיס, ולכן לא הייתה דרך לסנן לפיו.
  { key: 'refunded',       label: 'זוכה',              icon: Undo2,         cls: 'border-amber-200 text-amber-700' },
  // ⚠️ המבוטלות בכרטיס נפרד ומחוץ ל"הכל": בערב הפתיחה הן היו רוב
  // השורות (ניסיונות שלא הושלמו) והסתירו את ההזמנות שצריך לטפל בהן.
  { key: 'cancelled',      label: 'בוטל',              icon: XCircle,       cls: 'border-slate-200 text-slate-400' },
]

/**
 * האם הזמנה שייכת לכרטיס סינון.
 *
 * 🔴 שלושה כרטיסים אינם "סטטוס שווה ל-" (בקשת המשתמש 05.10):
 *   · "שולם — לליקוט" — רק משלוחים. מכירה בדוכן כבר נמסרה ביד, ואיסוף
 *     עצמי אינו נארז לשליחה.
 *   · "נמסר" — כולל את מכירות הדוכן ששולמו, ולא רק status='delivered'.
 *   · "ממתין לאימות כתובת" — תנאי ולא סטטוס; ⚠️ בלי pending_payment:
 *     הזמנה שלא שולמה אינה צריכה אימות כתובת.
 */
function inCard(o: BookFairOrder, key: string): boolean {
  switch (key) {
    case 'all':
      return o.status !== 'cancelled' && o.status !== 'pending_payment'
    case 'needs_address':
      return o.delivery_method === 'shipping' && !o.address_confirmed &&
        o.status !== 'cancelled' && o.status !== 'failed' && o.status !== 'pending_payment'
    case 'paid':
      return o.status === 'paid' && o.delivery_method === 'shipping'
    case 'delivered':
      return o.status === 'delivered' || (o.channel === 'fair' && o.status === 'paid')
    default:
      return o.status === key
  }
}

export default function OrdersClient({ orders, itemCounts }: {
  orders: BookFairOrder[]
  itemCounts: Record<string, number>
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [card, setCard] = useState<typeof CARDS[number]['key']>('all')
  const [purging, setPurging] = useState(false)

  const COLUMNS = useMemo(() => columnsOf(itemCounts), [itemCounts])

  // ⚠️ המונה והסינון מאותה פונקציה (inCard) — מונה שמחושב בנפרד
  // היה מראה מספר אחד בכרטיס ושורות אחרות בטבלה.
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const { key } of CARDS) c[key] = orders.filter(o => inCard(o, key)).length
    return c
  }, [orders])

  const filtered = useMemo(() => {
    // ⚠️ המבוטלות וה"ממתינות לתשלום" מוסתרות מ"הכל" ונגישות רק
    // בכרטיס שלהן: שתיהן אינן הזמנות אלא ניסיונות שלא הושלמו,
    // ובערב הפתיחה הן היו רוב השורות והסתירו את מה שצריך טיפול.
    const rows = orders.filter(o => inCard(o, card))

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

  // 🔴 פילוח לפי אמצעי תשלום — על השורות שבתצוגה (אחרי כרטיס, חיפוש וסינון),
  // כך שסינון "ערוץ: דוכן" מראה בדיוק כמה נכנס במזומן וכמה באשראי.
  const byPayment = useMemo(() => {
    const out = { cash: 0, card: 0 }
    for (const o of tc.rows) {
      if (!['paid', 'picking', 'packed', 'shipped', 'delivered', 'partially_refunded'].includes(o.status)) continue
      const net = o.total_agorot - o.refunded_agorot
      const p = paymentLabel(o)
      if (p === 'מזומן') out.cash += net
      else if (p === 'אשראי') out.card += net
    }
    return out
  }, [tc.rows])

  const revenue = useMemo(
    // ⚠️ רק הזמנות ששולמו בפועל, בניכוי זיכויים — לא סך ההזמנות.
    // הזמנה שלא שולמה אינה הכנסה.
    () => orders
      .filter(o => ['paid', 'picking', 'packed', 'shipped', 'delivered', 'partially_refunded'].includes(o.status))
      .reduce((s, o) => s + o.total_agorot - o.refunded_agorot, 0),
    [orders]
  )

  /**
   * מחיקת כל ההזמנות שננטשו בדף הסליקה.
   *
   * 🔴 אישור עם המספר בתוכו: "האם אתה בטוח?" בלי כמות אינו אישור.
   *
   * ⚠️ רק ישנות מ-30 דקות (נאכף בשרת): מי שנמצא *כרגע* בדף הסליקה
   * נמצא בדיוק במצב הזה, ומחיקתו באמצע הורסת תשלום פעיל.
   */
  async function purgePending() {
    const n = tc.rows.length
    if (!window.confirm(
      `למחוק ${n} הזמנות שננטשו בדף הסליקה?

` +
      'לא נגבה עליהן תשלום, והמלאי ישוחרר. הפעולה אינה הפיכה.'
    )) return

    setPurging(true)
    try {
      const res = await fetch('/api/admin/book-fair/orders/purge-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ olderThanMinutes: 30 }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { alert(json.error ?? 'המחיקה נכשלה'); return }
      // ⚠️ נאמר במפורש כשנמחקו פחות מהמוצג: ההפרש הוא הזמנות שנפתחו
      // בחצי השעה האחרונה, והן נשארו בכוונה.
      if ((json.deleted ?? 0) < n) {
        alert(`נמחקו ${json.deleted} מתוך ${n}. היתר נפתחו בחצי השעה האחרונה ונשארו.`)
      }
      router.refresh()
    } catch {
      alert('המחיקה נכשלה — בדקו את החיבור')
    } finally {
      setPurging(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── כרטיסי סינון ── */}
      {/* ⚠️ 8 עמודות: הכרטיסים הנוספים ("זוכה", "בוטל") נפלו לשורה
          שנייה לבדם ונראו כמו תקלה. ב-xl כולם בשורה אחת. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
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
        <span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
          <span className="inline-flex items-center gap-1"><Banknote size={14} className="text-emerald-600" /> מזומן {fmtAgorot(byPayment.cash)}</span>
          <span className="text-slate-300">|</span>
          <span className="inline-flex items-center gap-1"><CreditCard size={14} className="text-sky-600" /> אשראי {fmtAgorot(byPayment.card)}</span>
          <span className="text-xs text-slate-400">(בתצוגה)</span>
        </span>

        {/* 🔴 ניקוי דפי סליקה שננטשו — מוצג רק בכרטיס שלהם, כדי שלא
            ייפול בטעות על רשימה אחרת. */}
        {card === 'pending_payment' && tc.rows.length > 0 && (
          <button
            onClick={() => void purgePending()}
            disabled={purging}
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
          >
            {purging ? 'מוחק…' : 'מחיקת כל הממתינות לתשלום'}
          </button>
        )}
      </div>

      {/* ⚠️ בלי overflow-x: הגלילה לרוחב אסורה ונאכפת בלינט */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <table className="w-full table-fixed">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>{tc.shown.map((c, i) => tc.th(c, i))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pg.rows.map(o => (
              // 🔴 כל השורה לחיצה ופותחת את ההזמנה — קודם רק מספר
              // ההזמנה היה קישור, והמשתמש לחץ על השורה ולא קרה דבר.
              // ⚠️ נגיש מהמקלדת (role + tabIndex + Enter) ולא רק בעכבר.
              <tr
                key={o.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/admin/book-fair/orders/${o.id}`)}
                onKeyDown={e => {
                  if (e.key === 'Enter') router.push(`/admin/book-fair/orders/${o.id}`)
                }}
                className="cursor-pointer text-sm transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
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
          // ⚠️ עוצר את האירוע: השורה כולה כבר מנווטת לאותו יעד, ובלי
          // זה הניווט קורה פעמיים.
          onClick={e => e.stopPropagation()}
          className="font-mono text-xs font-semibold text-indigo-700 hover:underline"
        >
          {o.order_number}
        </Link>
      )

    case 'customer':
      return (
        <div className="min-w-0 truncate font-medium text-slate-900" title={o.customer_name ?? ''}>
          {o.customer_name || '—'}
        </div>
      )

    // ⚠️ dir="ltr" — מספר טלפון בכיוון RTL מוצג עם האפס בסוף.
    case 'phone':
      return o.customer_phone
        ? (
          <a
            href={`tel:${o.customer_phone}`}
            onClick={e => e.stopPropagation()}
            dir="ltr"
            className="font-mono text-xs text-slate-600 hover:text-indigo-700 hover:underline"
          >
            {o.customer_phone}
          </a>
        )
        : <span className="text-slate-300">—</span>

    case 'channel':
      return (
        <span className="inline-flex flex-col gap-0.5 text-slate-600">
          <span className="inline-flex items-center gap-1">
            {o.channel === 'web' ? <Globe size={13} />
              : o.channel === 'fair' ? <Store size={13} />
              : <Phone size={13} />}
            <span className="text-xs">{BOOK_FAIR_CHANNEL_LABELS[o.channel]}</span>
          </span>
          {/* 🔴 בדוכן אין סליקה — המוכר מתעד מה נגבה בפועל, ובלי
              שהמסך יציג זאת אי אפשר להצליב מול הקופה בסוף הערב. */}
          {o.channel === 'fair' && o.payment_method && (
            <span className="text-[11px] text-slate-400">
              {o.payment_method === 'cash' ? '💵 מזומן' : '💳 אשראי'}
              {o.sold_by ? ` · ${o.sold_by}` : ''}
            </span>
          )}
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

    case 'payment': {
      const p = paymentLabel(o)
      if (p === '—') return <span className="text-slate-300">—</span>
      return (
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
          p === 'מזומן' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>
          {p === 'מזומן' ? <Banknote size={12} /> : <CreditCard size={12} />} {p}
        </span>
      )
    }

    case 'status':
      return (
        <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${BOOK_FAIR_STATUS_COLORS[o.status]}`}>
          {BOOK_FAIR_STATUS_LABELS[o.status]}
        </span>
      )

    case 'created':
      return (
        <span className="whitespace-nowrap text-xs text-slate-500">
          {ilDate(o.created_at)}
        </span>
      )

    // ⚠️ בלי ה-case הזה התא נשאר ריק לגמרי: ה-switch מרנדר כל עמודה
    // במפורש, ו-value() משמש למיון ולסינון בלבד — לא להצגה.
    //
    // ⚠️ שעה ולא תאריך: כל ההזמנות מאותו יום, והשעה היא מה שמשווים
    // מול הדוח של נדרים. התאריך כבר בעמודה שלצידה.
    case 'paid_at':
      return o.paid_at ? (
        <span className="whitespace-nowrap text-xs text-slate-600">
          {ilTime(o.paid_at)}
        </span>
      ) : (
        <span className="text-xs text-slate-300">—</span>
      )
  }
}
