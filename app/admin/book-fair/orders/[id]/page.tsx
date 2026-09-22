import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Globe, Phone, Mail, MapPin, Calendar } from 'lucide-react'
import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/PageHeader'
import { fmtAgorot } from '@/lib/bookFairPricing'
import {
  BOOK_FAIR_STATUS_LABELS, BOOK_FAIR_STATUS_COLORS,
  BOOK_FAIR_CHANNEL_LABELS, BOOK_FAIR_DELIVERY_LABELS,
  oneOf,
  type BookFairOrder, type BookFairOrderItem, type BookFairRecording,
} from '@/types/bookFair'
import OrderPanel from './OrderPanel'

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

  const [{ data: items }, { data: recordings }, { data: payments }, { data: cities }] = await Promise.all([
    supabase.from('book_fair_order_items').select('*').eq('order_id', id),
    supabase.from('book_fair_recordings').select('*').eq('order_id', id).order('created_at'),
    supabase.from('book_fair_payments').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    supabase.from('book_fair_cities').select('id, name').eq('is_active', true).order('sort_order'),
  ])

  const o = order as BookFairOrder
  const city = oneOf(o.city)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/book-fair/orders"
          className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-800"
        >
          <ArrowRight size={15} /> חזרה להזמנות
        </Link>
        <PageHeader
          title={`הזמנה ${o.order_number}`}
          subtitle={`${BOOK_FAIR_CHANNEL_LABELS[o.channel]} · ${new Date(o.created_at).toLocaleString('he-IL')}`}
        >
          <span className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${BOOK_FAIR_STATUS_COLORS[o.status]}`}>
            {BOOK_FAIR_STATUS_LABELS[o.status]}
          </span>
        </PageHeader>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── פרטי הלקוח והפריטים ── */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">פרטי הלקוח</h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Detail icon={Globe} label="שם">{o.customer_name || '—'}</Detail>
              <Detail icon={Phone} label="טלפון">
                {o.customer_phone
                  ? <a href={`tel:${o.customer_phone}`} dir="ltr" className="font-mono text-indigo-700 hover:underline">{o.customer_phone}</a>
                  : '—'}
              </Detail>
              <Detail icon={Mail} label="אימייל">
                {o.customer_email
                  ? <a href={`mailto:${o.customer_email}`} dir="ltr" className="text-indigo-700 hover:underline">{o.customer_email}</a>
                  : '—'}
              </Detail>
              <Detail icon={Calendar} label="שולם">
                {o.paid_at ? new Date(o.paid_at).toLocaleString('he-IL') : 'טרם'}
              </Detail>
              <Detail icon={MapPin} label="מסירה" wide>
                {BOOK_FAIR_DELIVERY_LABELS[o.delivery_method]}
                {o.delivery_method === 'shipping' && (
                  <span className="text-slate-600">
                    {' · '}{o.address_text || 'טרם הוזנה כתובת'}{city ? `, ${city.name}` : ''}
                  </span>
                )}
              </Detail>
            </dl>
          </section>

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
                      <div className="truncate font-medium text-slate-900" title={it.title_snapshot}>
                        {it.title_snapshot}
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
          cities={(cities ?? []) as { id: string; name: string }[]}
          recordings={(recordings ?? []) as BookFairRecording[]}
          payments={(payments ?? []) as { id: string; status: string; amount_agorot: number; transaction_id: string | null; created_at: string; error_message: string | null }[]}
        />
      </div>
    </div>
  )
}

function Detail({ icon: Icon, label, children, wide }: {
  icon: React.ElementType; label: string; children: React.ReactNode; wide?: boolean
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="mb-0.5 flex items-center gap-1.5 text-xs text-slate-500">
        <Icon size={13} /> {label}
      </dt>
      <dd className="text-sm text-slate-900">{children}</dd>
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
