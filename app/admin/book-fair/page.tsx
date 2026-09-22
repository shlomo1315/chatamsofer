import Link from 'next/link'
import {
  BookOpen, ShoppingCart, Boxes, Settings2, TrendingUp, Mic,
  AlertTriangle, Package, Globe, Phone, ArrowLeft, CircleDot,
} from 'lucide-react'
import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/fetchAllRows'
import PageHeader from '@/components/ui/PageHeader'
import { fmtAgorot } from '@/lib/bookFairPricing'
import {
  BOOK_FAIR_STATUS_LABELS, BOOK_FAIR_STATUS_COLORS,
  type BookFairOrderStatus, type BookFairChannel,
} from '@/types/bookFair'

// לוח הבקרה של יריד הספרים.
//
// ⚠️ המסך עונה על שלוש שאלות שהצוות שואל בכל בוקר: כמה נכנס, מה
// ממתין לטיפול, ומה עומד להיגמר. כרטיסי ניווט ריקים לא עונים על אף
// אחת מהן.

export const dynamic = 'force-dynamic'

type OrderRow = {
  id: string; status: BookFairOrderStatus; channel: BookFairChannel
  total_agorot: number; refunded_agorot: number
  delivery_method: string; address_confirmed: boolean
  created_at: string; customer_name: string | null; order_number: string
}

type BookRow = {
  id: string; title: string; sku: string
  stock_web: number; stock_phone: number; is_active: boolean
}

/** סטטוסים שנחשבים הכנסה בפועל — הזמנה שלא שולמה אינה הכנסה. */
const PAID = ['paid', 'picking', 'packed', 'shipped', 'delivered', 'partially_refunded']

async function getData() {
  if (!isSupabaseConfigured()) {
    return { orders: [] as OrderRow[], books: [] as BookRow[], open: false, cities: 0, tiers: 0 }
  }
  const supabase = await createClient()

  const [o, b, gate, c, t] = await Promise.all([
    // ⚠️ fetchAllRows: PostgREST קוטע ב-1,000 שורות בשקט, וסיכום על
    // רשימה חתוכה נראה בדיוק כמו סיכום מלא.
    fetchAllRows<OrderRow>((from, to) =>
      supabase.from('book_fair_orders')
        .select('id, status, channel, total_agorot, refunded_agorot, delivery_method, address_confirmed, created_at, customer_name, order_number')
        .order('created_at', { ascending: false })
        .range(from, to)
    ),
    fetchAllRows<BookRow>((from, to) =>
      supabase.from('book_fair_books')
        .select('id, title, sku, stock_web, stock_phone, is_active')
        .range(from, to)
    ),
    supabase.from('app_settings').select('value').eq('key', 'book_fair_open').maybeSingle(),
    supabase.from('book_fair_cities').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('book_fair_shipping_tiers').select('id', { count: 'exact', head: true }),
  ])

  return {
    orders: o.rows,
    books: b.rows,
    // 🔴 ברירת מחדל סגור — זהה לחנות ולצ'קאאוט.
    open: String(gate.data?.value ?? '') === 'true',
    cities: c.count ?? 0,
    tiers: t.count ?? 0,
  }
}

export default async function BookFairPage() {
  await guardPage('book_fair')
  const { orders, books, open, cities, tiers } = await getData()

  const paid = orders.filter(o => PAID.includes(o.status))
  const revenue = paid.reduce((s, o) => s + o.total_agorot - o.refunded_agorot, 0)

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayOrders = orders.filter(o => new Date(o.created_at) >= today)

  const needsAddress = orders.filter(o =>
    o.delivery_method === 'shipping' && !o.address_confirmed &&
    o.status !== 'cancelled' && o.status !== 'failed'
  )
  const toPick = orders.filter(o => o.status === 'paid')
  const mismatch = orders.filter(o => o.status === 'payment_mismatch')

  const activeBooks = books.filter(b => b.is_active)
  const stockWeb = activeBooks.reduce((s, b) => s + b.stock_web, 0)
  const stockPhone = activeBooks.reduce((s, b) => s + b.stock_phone, 0)
  // ⚠️ "אוזל" = נותרו 3 ומטה באחד הערוצים, אך לא אפס בשניהם — ספר
  // שאזל לגמרי כבר אינו דורש החלטה, הוא פשוט לא נמכר.
  const lowStock = activeBooks
    .filter(b => (b.stock_web + b.stock_phone) > 0 && (b.stock_web + b.stock_phone) <= 3)
    .slice(0, 5)

  const byChannel = {
    web: paid.filter(o => o.channel === 'web').length,
    phone: paid.filter(o => o.channel === 'phone').length,
  }

  // 🔴 מה שחוסם את פתיחת היריד בפועל
  const blockers: string[] = []
  if (!activeBooks.length) blockers.push('הקטלוג ריק — הוסיפו ספרים או ייבאו מאקסל')
  if (!cities) blockers.push('לא הוגדרו ערי משלוח')
  if (!tiers) blockers.push('לא הוגדרו מדרגות תעריף משלוח')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="יריד ספרים" subtitle="קטלוג, מלאי והזמנות — מהאתר ומהמערכת הטלפונית">
        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
          open ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'
        }`}>
          <CircleDot size={14} />
          {open ? 'היריד פתוח' : 'היריד סגור'}
        </span>
      </PageHeader>

      {/* ── מה חוסם ── */}
      {blockers.length > 0 && (
        <section className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
            <AlertTriangle size={17} /> לפני שפותחים את היריד
          </h2>
          <ul className="mb-3 flex flex-col gap-1 text-sm text-amber-800">
            {blockers.map((b, i) => <li key={i}>· {b}</li>)}
          </ul>
          <div className="flex flex-wrap gap-2">
            {!activeBooks.length && (
              <Link href="/admin/book-fair/books" className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
                לקטלוג
              </Link>
            )}
            {(!cities || !tiers) && (
              <Link href="/admin/book-fair/settings" className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100">
                להגדרות
              </Link>
            )}
          </div>
        </section>
      )}

      {/* ── מספרים ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={TrendingUp} tone="emerald"
          value={fmtAgorot(revenue)} label="הכנסות"
          sub={`${paid.length} הזמנות ששולמו`}
        />
        <Stat
          icon={ShoppingCart} tone="indigo"
          value={String(todayOrders.length)} label="הזמנות היום"
          sub={`${byChannel.web} מהאתר · ${byChannel.phone} מהטלפון`}
        />
        <Stat
          icon={Globe} tone="sky"
          value={stockWeb.toLocaleString('en-US')} label="עותקים באתר"
          sub={`${activeBooks.length} כותרים פעילים`}
        />
        <Stat
          icon={Phone} tone="violet"
          value={stockPhone.toLocaleString('en-US')} label="עותקים בטלפון"
          sub="מכסה נפרדת לחלוטין"
        />
      </div>

      {/* ── תורי עבודה ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <QueueCard
          href="/admin/book-fair/orders"
          icon={Package} tone="emerald"
          count={toPick.length}
          title="ממתין לליקוט"
          desc="הזמנות ששולמו וטרם נארזו"
          rows={toPick.slice(0, 3).map(o => ({ id: o.id, main: o.customer_name || '—', side: o.order_number }))}
        />
        <QueueCard
          href="/admin/book-fair/orders"
          icon={Mic} tone="purple"
          count={needsAddress.length}
          title="כתובת בהקלטה"
          desc="הזמנות טלפוניות שממתינות להקלדת הכתובת"
          rows={needsAddress.slice(0, 3).map(o => ({ id: o.id, main: o.customer_name || '—', side: o.order_number }))}
        />
        <QueueCard
          href="/admin/book-fair/orders"
          icon={AlertTriangle} tone="red"
          count={mismatch.length}
          title="אי-התאמה בסכום"
          desc="נגבה סכום שאינו תואם — דורש בדיקה"
          rows={mismatch.slice(0, 3).map(o => ({ id: o.id, main: o.customer_name || '—', side: fmtAgorot(o.total_agorot) }))}
        />
      </div>

      {/* ── מלאי אוזל ── */}
      {lowStock.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
            <Boxes size={17} className="text-amber-600" /> ספרים שאוזלים
          </h2>
          <ul className="flex flex-col gap-2">
            {lowStock.map(b => (
              <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs text-slate-400">{b.sku}</span>
                  <span className="mr-2 text-slate-800">{b.title}</span>
                </span>
                <span className="flex flex-shrink-0 gap-3 text-xs">
                  <span className={b.stock_web === 0 ? 'text-red-600' : 'text-slate-600'}>
                    אתר {b.stock_web}
                  </span>
                  <span className={b.stock_phone === 0 ? 'text-red-600' : 'text-slate-600'}>
                    טלפון {b.stock_phone}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <Link href="/admin/book-fair/books" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline">
            לניהול המלאי <ArrowLeft size={14} />
          </Link>
        </section>
      )}

      {/* ── הזמנות אחרונות ── */}
      {orders.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">הזמנות אחרונות</h2>
            <Link href="/admin/book-fair/orders" className="text-sm font-medium text-indigo-600 hover:underline">
              לכל ההזמנות
            </Link>
          </div>
          <ul className="flex flex-col divide-y divide-slate-100">
            {orders.slice(0, 5).map(o => (
              <li key={o.id}>
                <Link href={`/admin/book-fair/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm transition hover:bg-slate-50">
                  <span className="flex min-w-0 items-center gap-2">
                    {o.channel === 'web' ? <Globe size={13} className="flex-shrink-0 text-slate-400" /> : <Phone size={13} className="flex-shrink-0 text-slate-400" />}
                    <span className="truncate font-medium text-slate-800">{o.customer_name || '—'}</span>
                    <span className="flex-shrink-0 font-mono text-xs text-slate-400">{o.order_number}</span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    <span className="tabular-nums text-slate-700">{fmtAgorot(o.total_agorot)}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-xs ${BOOK_FAIR_STATUS_COLORS[o.status]}`}>
                      {BOOK_FAIR_STATUS_LABELS[o.status]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── קיצורים ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Shortcut href="/admin/book-fair/orders"   icon={ShoppingCart} label="הזמנות" />
        <Shortcut href="/admin/book-fair/books"    icon={BookOpen}     label="קטלוג ומלאי" />
        <Shortcut href="/admin/book-fair/books"    icon={Boxes}        label="ייבוא מאקסל" />
        <Shortcut href="/admin/book-fair/settings" icon={Settings2}    label="הגדרות" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-600',
  indigo:  'bg-indigo-50 text-indigo-600',
  sky:     'bg-sky-50 text-sky-600',
  violet:  'bg-violet-50 text-violet-600',
  purple:  'bg-purple-50 text-purple-600',
  red:     'bg-red-50 text-red-600',
} as const

function Stat({ icon: Icon, tone, value, label, sub }: {
  icon: React.ElementType; tone: keyof typeof TONES
  value: string; label: string; sub?: string
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon size={17} />
      </span>
      <span className="text-2xl font-bold tabular-nums leading-none text-slate-900">{value}</span>
      <span className="text-sm text-slate-600">{label}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  )
}

function QueueCard({ href, icon: Icon, tone, count, title, desc, rows }: {
  href: string; icon: React.ElementType; tone: keyof typeof TONES
  count: number; title: string; desc: string
  rows: { id: string; main: string; side: string }[]
}) {
  // ⚠️ תור ריק מוצג עמום ולא מוסתר: היעלמות הכרטיס הייתה משאירה את
  // הצוות בלי לדעת שהתור הזה בכלל קיים.
  const empty = count === 0
  return (
    <Link
      href={href}
      className={`flex flex-col gap-2 rounded-2xl border bg-white p-4 transition hover:shadow-sm ${
        empty ? 'border-slate-200 opacity-60' : 'border-slate-300'
      }`}
    >
      <span className="flex items-center justify-between">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONES[tone]}`}>
          <Icon size={15} />
        </span>
        <span className="text-2xl font-bold tabular-nums text-slate-900">{count}</span>
      </span>
      <span className="font-medium text-slate-800">{title}</span>
      <span className="text-xs text-slate-500">{desc}</span>
      {rows.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1 border-t border-slate-100 pt-2">
          {rows.map(r => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-slate-600">{r.main}</span>
              <span className="flex-shrink-0 font-mono text-slate-400">{r.side}</span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  )
}

function Shortcut({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
    >
      <Icon size={16} className="text-slate-400 transition group-hover:text-indigo-500" />
      {label}
    </Link>
  )
}
