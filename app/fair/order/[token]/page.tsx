import Link from 'next/link'
import { CheckCircle2, Clock, XCircle, Package, Truck, AlertTriangle, BookOpen } from 'lucide-react'
import { verifyPublicToken } from '@/lib/publicToken'
import { getServiceClient } from '@/lib/apiAuth'
import { fmtAgorot } from '@/lib/bookFairPricing'
import {
  BOOK_FAIR_DELIVERY_LABELS,
  type BookFairOrderStatus,
} from '@/types/bookFair'

// מעקב הזמנה — מה שהלקוח מקבל בקישור האישי.
//
// 🔴 הגישה בטוקן חתום ולא במזהה ההזמנה: מזהה בקישור היה מאפשר לקרוא
// הזמנות של אחרים בניחוש. טוקן פגום או שפג מציג "קישור אינו תקין"
// ולא חושף דבר.

export const dynamic = 'force-dynamic'

type Item = { title_snapshot: string; sku_snapshot: string | null; quantity: number; line_total_agorot: number }

/** ⚠️ הסטטוסים הפנימיים אינם מוצגים כלשונם — הלקוח צריך לדעת מה קורה
    עם ההזמנה שלו, לא איך המערכת מסווגת אותה. */
const CUSTOMER_VIEW: Record<BookFairOrderStatus, { icon: typeof Clock; text: string; tone: string }> = {
  pending_payment:    { icon: Clock,        text: 'ממתין להשלמת התשלום', tone: 'amber' },
  payment_mismatch:   { icon: AlertTriangle, text: 'ההזמנה בבדיקה. ניצור קשר בהקדם.', tone: 'amber' },
  paid:               { icon: CheckCircle2, text: 'ההזמנה התקבלה ואושרה', tone: 'emerald' },
  picking:            { icon: Package,      text: 'ההזמנה בהכנה', tone: 'sky' },
  packed:             { icon: Package,      text: 'ההזמנה ארוזה ומוכנה', tone: 'sky' },
  shipped:            { icon: Truck,        text: 'ההזמנה נשלחה', tone: 'indigo' },
  delivered:          { icon: CheckCircle2, text: 'ההזמנה נמסרה', tone: 'emerald' },
  failed:             { icon: XCircle,      text: 'התשלום לא הושלם', tone: 'red' },
  cancelled:          { icon: XCircle,      text: 'ההזמנה בוטלה', tone: 'stone' },
  refunded:           { icon: CheckCircle2, text: 'ההזמנה זוכתה', tone: 'stone' },
  partially_refunded: { icon: CheckCircle2, text: 'בוצע זיכוי חלקי', tone: 'stone' },
}

const TONES: Record<string, string> = {
  amber:   'border-amber-300 bg-amber-50 text-amber-900',
  emerald: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  sky:     'border-sky-300 bg-sky-50 text-sky-900',
  indigo:  'border-indigo-300 bg-indigo-50 text-indigo-900',
  red:     'border-red-300 bg-red-50 text-red-900',
  stone:   'border-stone-300 bg-stone-50 text-stone-800',
}

export default async function OrderTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const orderId = verifyPublicToken(token, 'f')

  if (!orderId) return <Invalid />

  const db = getServiceClient()
  if (!db) return <Invalid />

  const { data: order } = await db.from('book_fair_orders')
    .select('order_number, status, customer_name, delivery_method, address_text, items_total_agorot, shipping_agorot, total_agorot, created_at, city:book_fair_cities(name)')
    .eq('id', orderId).maybeSingle()

  if (!order) return <Invalid />

  const { data: items } = await db.from('book_fair_order_items')
    .select('title_snapshot, sku_snapshot, quantity, line_total_agorot')
    .eq('order_id', orderId)

  const status = order.status as BookFairOrderStatus
  const view = CUSTOMER_VIEW[status] ?? CUSTOMER_VIEW.pending_payment
  const Icon = view.icon
  // ⚠️ join של Supabase מגיע כמערך או כאובייקט, תלוי בהקשר — שתי הצורות
  const city = Array.isArray(order.city) ? order.city[0] : order.city

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <header className="mb-6 flex items-center gap-3">
        <BookOpen size={26} className="text-[#1E3A5F]" strokeWidth={1.5} />
        <div>
          <h1 className="text-2xl font-bold text-stone-900">ההזמנה שלי</h1>
          <p className="text-base text-stone-500">יריד הספרים · היכל החתם סופר</p>
        </div>
      </header>

      <div className={`mb-5 flex items-center gap-3 rounded-xl border-2 p-5 ${TONES[view.tone]}`}>
        <Icon size={26} strokeWidth={1.5} className="flex-shrink-0" />
        <div>
          <p className="text-xl font-bold">{view.text}</p>
          <p className="text-base opacity-80">מספר הזמנה {order.order_number}</p>
        </div>
      </div>

      {status === 'pending_payment' && (
        <p className="mb-5 rounded-xl border-2 border-stone-200 bg-white p-4 text-base text-stone-700">
          אם ביצעתם את התשלום ועדיין מוצג מצב זה, ייתכן שהאישור בדרך.
          רעננו את הדף בעוד דקה.
        </p>
      )}

      <section className="mb-5 rounded-xl border-2 border-stone-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-bold text-stone-900">הספרים</h2>
        <ul className="flex flex-col gap-3">
          {(items ?? []).map((it: Item, i) => (
            <li key={i} className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                {it.sku_snapshot && <p className="font-mono text-sm text-stone-500">{it.sku_snapshot}</p>}
                <p className="text-[17px] font-medium text-stone-900">{it.title_snapshot}</p>
                {it.quantity > 1 && <p className="text-base text-stone-600">{it.quantity} עותקים</p>}
              </div>
              <span className="whitespace-nowrap text-lg font-bold tabular-nums text-stone-900">
                {fmtAgorot(it.line_total_agorot)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 flex flex-col gap-1.5 border-t-2 border-stone-200 pt-4 text-base">
          <div className="flex justify-between text-stone-700">
            <dt>ספרים</dt><dd className="tabular-nums">{fmtAgorot(order.items_total_agorot)}</dd>
          </div>
          <div className="flex justify-between text-stone-700">
            <dt>{BOOK_FAIR_DELIVERY_LABELS[order.delivery_method as 'pickup' | 'shipping']}</dt>
            <dd className="tabular-nums">
              {order.shipping_agorot === 0 ? 'ללא עלות' : fmtAgorot(order.shipping_agorot)}
            </dd>
          </div>
          <div className="flex justify-between pt-1 text-xl font-bold text-stone-900">
            <dt>סך הכול</dt><dd className="tabular-nums">{fmtAgorot(order.total_agorot)}</dd>
          </div>
        </dl>
      </section>

      {order.delivery_method === 'shipping' && (
        <section className="mb-5 rounded-xl border-2 border-stone-200 bg-white p-5">
          <h2 className="mb-2 text-lg font-bold text-stone-900">כתובת למשלוח</h2>
          <p className="text-[17px] text-stone-800">{order.customer_name}</p>
          <p className="text-[17px] text-stone-700">
            {order.address_text}{city?.name ? `, ${city.name}` : ''}
          </p>
        </section>
      )}

      <p className="text-center text-base text-stone-500">
        שמרו את הקישור לצפייה בהזמנה בכל עת ·{' '}
        <Link href="/fair" className="font-medium text-[#1E3A5F] underline">חזרה ליריד</Link>
      </p>
    </main>
  )
}

function Invalid() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <XCircle size={44} className="text-stone-400" strokeWidth={1.5} />
      <h1 className="text-2xl font-bold text-stone-900">הקישור אינו תקין</h1>
      <p className="text-lg text-stone-600">
        ייתכן שהקישור הועתק חלקית או שפג תוקפו.
      </p>
      <Link href="/fair" className="mt-2 rounded-xl bg-[#1E3A5F] px-6 py-3 text-lg font-semibold text-white">
        לחזרה ליריד
      </Link>
    </main>
  )
}
