'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Printer, Loader2, X } from 'lucide-react'
import {
  BOOK_FAIR_CHANNEL_LABELS, BOOK_FAIR_STATUS_LABELS, oneOf,
  type BookFairOrder, type BookFairOrderItem,
} from '@/types/bookFair'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { ilDate, ilDateTime } from '@/lib/israelTime'
import { readPrintIds } from '@/lib/bookFairOrderHandoff'

// ─────────────────────────────────────────────────────────────────────────────
// תעודות משלוח ורשימת כתובות למשלוחן.
//
// 🔴 התוכן נשתל ב-portal ישירות ב-body: ה-layout של הניהול הוא
// h-screen overflow-hidden, וכל הדפסה מתוכו נחתכת אחרי עמוד אחד —
// בלי שגיאה, פשוט חבילות שלא מודפסות.
//
// ⚠️ HTML ולא PDF: עברית ב-PDF דורשת היפוך ידני (pdfBidi) שכבר הפך
// מספרי טלפון ות"ז בעבר. הדפדפן מסדר עברית ומספרים נכון מעצמו.
// ─────────────────────────────────────────────────────────────────────────────

type Order = BookFairOrder
type Item = BookFairOrderItem

const NO_CITY = 'ללא עיר'

const PRINT_CSS = `
@media screen {
  #bf-print { position: fixed; inset: 0; z-index: 1000; overflow-y: auto; background: #e2e8f0; }
}
@media print {
  @page { size: A4; margin: 10mm; }
  html, body { background: #fff !important; height: auto !important; min-height: 0 !important; }
  body > *:not(#bf-print) { display: none !important; }
  #bf-print { position: static; background: #fff; }
  .bf-noprint { display: none !important; }
  .bf-page { break-after: page; box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; border: 0 !important; }
  .bf-page:last-child { break-after: auto; }
  .bf-avoid { break-inside: avoid; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`

/** האם רץ בדפדפן — ל-portal. בלי setState ב-effect. */
function useMounted(): boolean {
  return useSyncExternalStore(() => () => {}, () => true, () => false)
}

export default function PrintClient({ mode, id, stashKey, autoPrint }: {
  mode: 'notes' | 'addresses'
  id: string | null
  stashKey: string | null
  autoPrint: boolean
}) {
  const mounted = useMounted()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState('')
  /** ערים שסומנו לרשימת הכתובות. ריק = כל הערים. */
  const [cities, setCities] = useState<Set<string>>(new Set())
  const printed = useRef(false)

  useEffect(() => {
    const ids = id ? [id] : stashKey ? readPrintIds(stashKey) : []
    let alive = true
    void (async () => {
      if (!ids.length) {
        if (alive) setError('רשימת ההזמנות להדפסה לא נמצאה — חזרו למסך ההזמנות ולחצו שוב על כפתור ההדפסה.')
        return
      }
      try {
        const res = await fetch('/api/admin/book-fair/orders/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        })
        const json = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok) { setError(json.error ?? 'שליפת ההזמנות נכשלה'); return }
        setItems(json.items ?? [])
        setOrders(json.orders ?? [])
      } catch {
        if (alive) setError('שליפת ההזמנות נכשלה — בדקו את החיבור')
      }
    })()
    return () => { alive = false }
  }, [id, stashKey])

  const itemsByOrder = useMemo(() => {
    const m: Record<string, Item[]> = {}
    for (const it of items) (m[it.order_id] ??= []).push(it)
    return m
  }, [items])

  // 🔴 תעודות — חלון ההדפסה נפתח לבד כשהנתונים מוכנים ("באופן אוטומטי").
  // ⚠️ פעם אחת בלבד (ref): רינדור חוזר לא יפתח חלון הדפסה שני.
  // ⚠️ רשימת הכתובות לא נפתחת לבד — קודם בוחרים ערים.
  useEffect(() => {
    if (!autoPrint || mode !== 'notes' || !orders?.length || printed.current) return
    printed.current = true
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [autoPrint, mode, orders])

  if (!mounted) return null

  const toolbar = (
    <div className="bf-noprint sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-4 py-3 shadow-sm">
      <h1 className="text-base font-bold text-slate-900">
        {mode === 'notes' ? 'תעודות משלוח' : 'רשימת כתובות למשלוחן'}
        {orders && <span className="mr-2 text-sm font-normal text-slate-500">({orders.length} הזמנות)</span>}
      </h1>
      <div className="flex-1" />
      <button
        onClick={() => window.print()}
        disabled={!orders?.length}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
      >
        <Printer size={15} /> הדפסה
      </button>
      <button
        onClick={() => window.close()}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
      >
        <X size={14} /> סגירה
      </button>
    </div>
  )

  let body: React.ReactNode
  if (error) {
    body = <p className="mx-auto mt-10 max-w-lg rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-700">{error}</p>
  } else if (!orders) {
    body = <p className="mt-16 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> טוען…</p>
  } else if (mode === 'notes') {
    body = orders.map(o => <DeliveryNote key={o.id} order={o} items={itemsByOrder[o.id] ?? []} />)
  } else {
    body = <AddressList orders={orders} itemsByOrder={itemsByOrder} cities={cities} setCities={setCities} />
  }

  return createPortal(
    <div id="bf-print" dir="rtl">
      <style>{PRINT_CSS}</style>
      {toolbar}
      <div className="flex flex-col items-center gap-6 px-3 py-6">{body}</div>
    </div>,
    document.body,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// תעודת משלוח — עמוד לכל הזמנה
// ─────────────────────────────────────────────────────────────────────────────

function paymentText(o: Order): string {
  if (o.payment_method === 'cash') return 'מזומן'
  if (o.payment_method === 'card' || o.channel === 'web' || o.channel === 'phone') return 'אשראי'
  return '—'
}

function DeliveryNote({ order: o, items }: { order: Order; items: Item[] }) {
  const city = oneOf(o.city)?.name ?? null
  const shipping = o.delivery_method === 'shipping'
  const copies = items.reduce((s, it) => s + it.quantity, 0)
  const volumes = items.reduce((s, it) => s + it.quantity * Math.max(1, it.volumes_snapshot || 1), 0)

  return (
    <article className="bf-page w-full max-w-[210mm] bg-white p-8 text-slate-900 shadow-md">
      {/* ── כותרת ── */}
      <header className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
        <div>
          <p className="text-sm font-semibold text-slate-600">יריד הספרים — היכל החתם סופר</p>
          <h2 className="text-2xl font-black">תעודת משלוח וסיכום הזמנה</h2>
        </div>
        <div className="text-left">
          <p className="text-xs text-slate-500">מספר הזמנה</p>
          <p className="font-mono text-2xl font-black" dir="ltr">{o.order_number}</p>
        </div>
      </header>

      {/* ── הכתובת — בולטת, כך שאפשר לגזור ולהדביק על החבילה ── */}
      <section className="bf-avoid mt-5 rounded-xl border-[3px] border-slate-900 p-5">
        <p className="mb-1 text-sm font-bold text-slate-500">{shipping ? 'אל:' : 'איסוף עצמי — לא למשלוח'}</p>
        <p className="text-3xl font-black leading-tight">{o.customer_name || '— שם טרם אומת —'}</p>
        {shipping && (
          <>
            <p className="mt-2 text-3xl font-bold leading-tight">{o.address_text || '— אין כתובת —'}</p>
            <p className="mt-1 text-4xl font-black leading-tight">{city ?? '— עיר לא נבחרה —'}</p>
          </>
        )}
        {o.customer_phone && (
          <p className="mt-3 text-2xl font-bold">
            טלפון: <span dir="ltr" className="font-mono">{o.customer_phone}</span>
          </p>
        )}
        {/* ⚠️ מודפס בכוונה: מי שאורז חייב לראות שהכתובת לא אומתה לפני שהחבילה יוצאת. */}
        {shipping && !o.address_confirmed && (
          <p className="mt-3 rounded-lg border-2 border-red-600 px-3 py-1.5 text-base font-bold text-red-700">
            ⚠ הכתובת טרם אומתה מול ההקלטה — לבדוק לפני משלוח
          </p>
        )}
        {!o.customer_name && (
          <p className="mt-2 rounded-lg border-2 border-red-600 px-3 py-1.5 text-base font-bold text-red-700">
            ⚠ השם טרם אומת מול ההקלטה
          </p>
        )}
      </section>

      {/* ── פרטי ההזמנה ── */}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <Detail label="תאריך הזמנה" value={ilDate(o.created_at)} />
        <Detail label="ערוץ" value={BOOK_FAIR_CHANNEL_LABELS[o.channel]} />
        <Detail label="תשלום" value={`${paymentText(o)}${o.paid_at ? ` · ${ilDateTime(o.paid_at)}` : ''}`} />
        <Detail label="סטטוס" value={BOOK_FAIR_STATUS_LABELS[o.status]} />
        {o.customer_email && <Detail label="מייל" value={o.customer_email} ltr />}
      </dl>

      {/* ── הספרים ── */}
      <table className="mt-4 w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-slate-900 text-right text-xs">
            <th className="w-8 py-1.5">✓</th>
            <th className="w-24 py-1.5">מק״ט</th>
            <th className="py-1.5">שם הספר</th>
            <th className="w-14 py-1.5 text-center">כרכים</th>
            <th className="w-12 py-1.5 text-center">כמות</th>
            <th className="w-20 py-1.5 text-left">מחיר</th>
            <th className="w-20 py-1.5 text-left">סה״כ</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.id} className="bf-avoid border-b border-slate-300">
              <td className="py-1.5"><span className="inline-block h-4 w-4 border-2 border-slate-700" /></td>
              <td className="py-1.5 font-mono text-xs" dir="ltr">{it.sku_snapshot ?? ''}</td>
              <td className="py-1.5 font-medium">{it.title_snapshot}</td>
              <td className="py-1.5 text-center tabular-nums">{it.volumes_snapshot > 1 ? it.volumes_snapshot : ''}</td>
              <td className="py-1.5 text-center text-base font-bold tabular-nums">{it.quantity}</td>
              <td className="py-1.5 text-left tabular-nums">{fmtAgorot(it.unit_price_agorot)}</td>
              <td className="py-1.5 text-left tabular-nums">{fmtAgorot(it.line_total_agorot)}</td>
            </tr>
          ))}
          {!items.length && (
            <tr><td colSpan={7} className="py-3 text-center text-slate-400">אין פריטים בהזמנה</td></tr>
          )}
        </tbody>
      </table>

      {/* ── סיכום ── */}
      <div className="bf-avoid mt-3 flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm font-semibold">
          סה״כ {copies} עותקים{volumes !== copies ? ` · ${volumes} כרכים` : ''}
        </p>
        <dl className="w-64 text-sm">
          <Sum label="ספרים" value={fmtAgorot(o.items_total_agorot)} />
          <Sum label={shipping ? 'משלוח' : 'איסוף עצמי'} value={o.shipping_agorot ? fmtAgorot(o.shipping_agorot) : 'ללא עלות'} />
          {o.refunded_agorot > 0 && <Sum label="זוכה" value={`- ${fmtAgorot(o.refunded_agorot)}`} />}
          <div className="mt-1 flex justify-between border-t-2 border-slate-900 pt-1 text-base font-black">
            <dt>סה״כ שולם</dt>
            <dd className="tabular-nums">{fmtAgorot(o.total_agorot - o.refunded_agorot)}</dd>
          </div>
        </dl>
      </div>

      <footer className="bf-avoid mt-8 grid grid-cols-2 gap-8 text-sm text-slate-600">
        <p>נארז ע״י: ____________________</p>
        <p>נבדק ע״י: ____________________</p>
      </footer>
    </article>
  )
}

function Detail({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="truncate font-medium" dir={ltr ? 'ltr' : undefined}>{value}</dd>
    </div>
  )
}

function Sum({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// רשימת כתובות למשלוחן — בלי שמות ספרים ובלי מחירים (בקשת המשתמש 07.10)
// ─────────────────────────────────────────────────────────────────────────────

function AddressList({ orders, itemsByOrder, cities, setCities }: {
  orders: Order[]
  itemsByOrder: Record<string, Item[]>
  cities: Set<string>
  setCities: (s: Set<string>) => void
}) {
  // ⚠️ מקובץ לפי עיר ומסודר א-ב: המשלוחן מתכנן מסלול לפי אזור.
  const groups = useMemo(() => {
    const m = new Map<string, Order[]>()
    for (const o of orders) {
      const c = oneOf(o.city)?.name ?? NO_CITY
      const list = m.get(c) ?? []
      list.push(o)
      m.set(c, list)
    }
    for (const list of m.values()) {
      list.sort((a, b) => (a.address_text ?? '').localeCompare(b.address_text ?? '', 'he'))
    }
    return [...m.entries()].sort(([a], [b]) => a === NO_CITY ? 1 : b === NO_CITY ? -1 : a.localeCompare(b, 'he'))
  }, [orders])

  const shown = cities.size ? groups.filter(([c]) => cities.has(c)) : groups
  const total = shown.reduce((s, [, l]) => s + l.length, 0)
  // מספור רץ לאורך כל הרשימה — נקודת ההתחלה של כל עיר.
  const starts = shown.reduce<number[]>((acc, _g, i) => [...acc, i ? acc[i - 1] + shown[i - 1][1].length : 0], [])
  // ⚠️ ב-state עצל ולא new Date() ברינדור — רינדור חייב להיות טהור.
  const [today] = useState(() => ilDate(new Date().toISOString()))

  function toggle(c: string) {
    const next = new Set(cities)
    if (next.has(c)) next.delete(c)
    else next.add(c)
    setCities(next)
  }

  return (
    <>
      {/* ── בחירת ערים — לא מודפס ── */}
      <div className="bf-noprint w-full max-w-[210mm] rounded-xl bg-white p-4 shadow-sm">
        <p className="mb-2 text-sm font-semibold text-slate-700">סינון לפי עיר <span className="font-normal text-slate-400">(בלי בחירה = כל הערים)</span></p>
        <div className="flex flex-wrap gap-1.5">
          {groups.map(([c, list]) => (
            <button
              key={c}
              onClick={() => toggle(c)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                cities.has(c) ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {c} ({list.length})
            </button>
          ))}
          {cities.size > 0 && (
            <button onClick={() => setCities(new Set())} className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800">
              ניקוי הבחירה
            </button>
          )}
        </div>
      </div>

      <article className="bf-page w-full max-w-[210mm] bg-white p-8 text-slate-900 shadow-md">
        <header className="mb-4 flex items-end justify-between border-b-2 border-slate-900 pb-2">
          <div>
            <p className="text-sm font-semibold text-slate-600">יריד הספרים — היכל החתם סופר</p>
            <h2 className="text-2xl font-black">רשימת משלוחים</h2>
          </div>
          <p className="text-sm">
            {total} חבילות · {shown.length} ערים · {today}
          </p>
        </header>

        {shown.map(([c, list], gi) => (
          <section key={c} className="mb-5">
            <h3 className="bf-avoid mb-1 border-b border-slate-400 text-lg font-black">
              {c} <span className="text-sm font-normal text-slate-500">({list.length})</span>
            </h3>
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="text-right text-xs text-slate-500">
                  <th className="w-8 py-1">#</th>
                  <th className="w-24 py-1">הזמנה</th>
                  <th className="w-[22%] py-1">שם</th>
                  <th className="py-1">כתובת</th>
                  <th className="w-28 py-1">טלפון</th>
                  <th className="w-14 py-1 text-center">ספרים</th>
                  <th className="w-10 py-1 text-center">✓</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o, i) => {
                  const copies = (itemsByOrder[o.id] ?? []).reduce((s, it) => s + it.quantity, 0)
                  return (
                    <tr key={o.id} className="bf-avoid border-t border-slate-200 align-top">
                      <td className="py-1.5 tabular-nums text-slate-500">{starts[gi] + i + 1}</td>
                      <td className="py-1.5 font-mono text-xs" dir="ltr">{o.order_number}</td>
                      <td className="py-1.5 font-semibold">{o.customer_name || '—'}</td>
                      <td className="py-1.5 font-semibold">
                        {o.address_text || '—'}
                        {!o.address_confirmed && <span className="mr-1 text-xs font-bold text-red-700">(לא אומתה)</span>}
                      </td>
                      <td className="py-1.5 font-mono text-xs" dir="ltr">{o.customer_phone ?? ''}</td>
                      <td className="py-1.5 text-center tabular-nums">{copies}</td>
                      <td className="py-1.5 text-center"><span className="inline-block h-4 w-4 border-2 border-slate-700" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        ))}
        {!shown.length && <p className="py-8 text-center text-slate-400">אין הזמנות למשלוח בבחירה זו</p>}
      </article>
    </>
  )
}
