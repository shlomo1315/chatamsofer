import Link from 'next/link'
import { ilDateTime } from '@/lib/israelTime'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/PageHeader'
import { fmtAgorot } from '@/lib/bookFairPricing'
import {
  BOOK_FAIR_STATUS_LABELS, BOOK_FAIR_STATUS_COLORS,
  BOOK_FAIR_CHANNEL_LABELS,
  type BookFairOrder, type BookFairOrderItem, type BookFairRecording,
} from '@/types/bookFair'
import OrderPanel from './OrderPanel'
import CustomerCard from './CustomerCard'
import OrderNav from './OrderNav'
import ProblemBookToggle from '../../ProblemBookToggle'
import { PROBLEM_BOOKS_KEY, parseProblemBooks } from '@/lib/bookFairProblemBooks'

// כרטיס הזמנה בודדת.

export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await guardPage('book_fair')
  const { id } = await params
  if (!isSupabaseConfigured()) notFound()

  const supabase = await createClient()

  const { data: order } = await supabase
    .from('book_fair_orders')
    .select('*, city:book_fair_cities(id, name)')
    .eq('id', id).maybeSingle()

  if (!order) notFound()

  const [{ data: items }, { data: recordings, error: recErr }, { data: payments }, { data: cities }] = await Promise.all([
    supabase.from('book_fair_order_items').select('*').eq('order_id', id),
    // ⚠️ מיון לפי kind ולא לפי created_at: שתי ההקלטות של אותה שיחה
    // נשמרות באותה שנייה בדיוק (createOrder כותב אותן יחד), ומיון לפי
    // זמן מחזיר סדר לא יציב בין רינדורים.
    supabase.from('book_fair_recordings').select('*').eq('order_id', id).order('kind'),
    supabase.from('book_fair_payments').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    supabase.from('book_fair_cities').select('id, name').eq('is_active', true).order('sort_order'),
  ])

  // 🔴 אבחון: הקלטת הכתובת נעלמה מהמסך בעוד היא קיימת במסד
  // ומקושרת להזמנה. בלי הלוג הזה אי אפשר לדעת אם היא לא נשלפה
  // (RLS/שגיאה) או שלא רונדרה.
  if (recErr) console.error('[book-fair/order] שליפת הקלטות נכשלה:', recErr)
  console.log(
    `[book-fair/order] ${id} — הקלטות: ${(recordings ?? []).length}` +
    ` (${(recordings ?? []).map(r => r.kind).join(', ') || 'אין'})`,
  )

  const o = order as BookFairOrder

  // ── שכנות כרונולוגיות + ספרים בעייתיים ──
  // ⚠️ השכנות הן גיבוי בלבד ל"הבאה/הקודמת": כשנכנסים מהטבלה, הסדר הוא
  // של הטבלה (OrderNav). מדלגים על מבוטלות ועל ממתינות לתשלום — כמו "הכל".
  const live = '("cancelled","pending_payment","failed")'
  const [{ data: newer }, { data: older }, { data: probRow }] = await Promise.all([
    supabase.from('book_fair_orders').select('id').not('status', 'in', live)
      .gt('created_at', o.created_at).order('created_at', { ascending: true }).limit(1),
    supabase.from('book_fair_orders').select('id').not('status', 'in', live)
      .lt('created_at', o.created_at).order('created_at', { ascending: false }).limit(1),
    supabase.from('app_settings').select('value').eq('key', PROBLEM_BOOKS_KEY).maybeSingle(),
  ])
  const problems = parseProblemBooks(probRow?.value)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/admin/book-fair/orders"
            className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-800"
          >
            <ArrowRight size={15} /> חזרה להזמנות
          </Link>
          <OrderNav id={o.id} fallbackPrev={newer?.[0]?.id ?? null} fallbackNext={older?.[0]?.id ?? null} />
        </div>
        <PageHeader
          title={`הזמנה ${o.order_number}`}
          subtitle={`${BOOK_FAIR_CHANNEL_LABELS[o.channel]} · ${ilDateTime(o.created_at)}`}
        >
          <span className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${BOOK_FAIR_STATUS_COLORS[o.status]}`}>
            {BOOK_FAIR_STATUS_LABELS[o.status]}
          </span>
        </PageHeader>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── פרטי הלקוח והפריטים ── */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* 🔴 שם, כתובת, הקלטות ותמלולים — כרטיס אחד (מוקאפ שאושר 05.10). */}
          <CustomerCard
            order={o}
            recordings={(recordings ?? []) as BookFairRecording[]}
            cities={(cities ?? []) as { id: string; name: string }[]}
          />

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">הספרים</h2>
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="pb-2 text-right">ספר</th>
                  <th className="w-20 pb-2 text-right">כמות</th>
                  <th className="w-28 pb-2 text-left">סכום</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(items ?? []).map((it: BookFairOrderItem) => (
                  <tr key={it.id}>
                    <td className="py-2.5">
                      {it.sku_snapshot && <div className="font-mono text-xs text-slate-400">{it.sku_snapshot}</div>}
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate font-medium text-slate-900" title={it.title_snapshot}>
                          {it.title_snapshot}
                        </div>
                        {/* ⚠️ ספר שנמחק מהקטלוג (book_id ריק) אינו ניתן לסימון. */}
                        {it.book_id && (
                          <ProblemBookToggle
                            bookId={it.book_id}
                            problem={it.book_id in problems}
                            note={problems[it.book_id]?.note}
                            compact={!(it.book_id in problems)}
                          />
                        )}
                      </div>
                      {it.volumes_snapshot > 1 && (
                        <div className="text-xs text-slate-500">{it.volumes_snapshot} כרכים</div>
                      )}
                    </td>
                    <td className="py-2.5 tabular-nums">{it.quantity}</td>
                    <td className="py-2.5 text-left tabular-nums">{fmtAgorot(it.line_total_agorot)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="mt-4 flex flex-col gap-1.5 border-t border-slate-200 pt-4 text-sm">
              <Row label="ספרים" value={fmtAgorot(o.items_total_agorot)} />
              <Row label={o.delivery_method === 'pickup' ? 'איסוף עצמי' : 'משלוח'}
                   value={o.shipping_agorot === 0 ? 'ללא עלות' : fmtAgorot(o.shipping_agorot)} />
              {o.refunded_agorot > 0 && (
                <Row label="זוכה" value={`- ${fmtAgorot(o.refunded_agorot)}`} tone="orange" />
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                <dt>סך הכול</dt>
                <dd className="tabular-nums">{fmtAgorot(o.total_agorot - o.refunded_agorot)}</dd>
              </div>
            </dl>
          </section>
        </div>

        {/* ── פעולות ── */}
        <OrderPanel
          order={o}
          items={(items ?? []) as BookFairOrderItem[]}
          payments={(payments ?? []) as { id: string; status: string; amount_agorot: number; transaction_id: string | null; created_at: string; error_message: string | null }[]}
        />
      </div>
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'orange' }) {
  return (
    <div className={`flex justify-between ${tone === 'orange' ? 'text-orange-700' : 'text-slate-600'}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
