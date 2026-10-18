import Link from 'next/link'
import { guardPage } from '@/lib/pageGuard'
import { getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import PageHeader from '@/components/ui/PageHeader'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { BOOK_FAIR_STATUS_LABELS, type BookFairOrderStatus } from '@/types/bookFair'
import {
  summarize, cancelledCharged, inconsistentDigits,
  FIXED_FAILED_TO_PAID, PAID_WITHOUT_CHARGE, MANUAL_REFUND_NO_CHARGE,
  type ReconciliationRow,
} from '@/lib/bookFairCardReconciliation'

// סיכום סנכרון האשראי מול אקסל נדרים. לקריאה בלבד.
// החישוב: lib/bookFairCardReconciliation.ts.
//
// ⚠️ לקוח השירות רק אחרי guardPage, כמו בשאר מסכי היריד.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'סנכרון אשראי - יריד הספרים' }

type OrderRef = { id: string; order_number: string; status: BookFairOrderStatus; total_agorot: number | null }

type FailedOrder = { id: string; order_number: string; total_agorot: number | null; created_at: string }

function fmtDate(v: string) {
  return new Date(v).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })
}

/** השעה נשמרה כפי שהיא באקסל, בלי אזור זמן, ולכן מוצגת כמו שהיא. */
function fmtLocal(v: string) {
  const [d, t = ''] = v.split(/[T ]/)
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y} ${t.slice(0, 5)}`
}

export default async function CardReconciliationPage() {
  await guardPage('book_fair')
  const db = getServiceClient()
  if (!db) return <p className="text-sm text-red-600">אין חיבור למסד.</p>

  const { rows, error } = await fetchAllRows<ReconciliationRow>((from, to) =>
    db.from('book_fair_card_reconciliation')
      .select('order_number, charged_at, amount_agorot, card_last4, transaction_id, match_type, deviation_minutes, system_last4')
      .order('charged_at', { ascending: false }).range(from, to))

  const numbers = [...new Set([
    ...rows.map(r => r.order_number), ...FIXED_FAILED_TO_PAID, ...PAID_WITHOUT_CHARGE, ...MANUAL_REFUND_NO_CHARGE,
  ])]
  const orders: OrderRef[] = []
  for (let i = 0; i < numbers.length; i += 200) {
    const { data } = await db.from('book_fair_orders')
      .select('id, order_number, status, total_agorot').in('order_number', numbers.slice(i, i + 200))
    orders.push(...((data ?? []) as OrderRef[]))
  }
  const { rows: failed, error: failedError } = await fetchAllRows<FailedOrder>((from, to) =>
    db.from('book_fair_orders')
      .select('id, order_number, total_agorot, created_at')
      .eq('status', 'failed').eq('payment_method', 'card')
      .order('created_at', { ascending: false }).range(from, to))
  const chargedNumbers = new Set(rows.map(r => r.order_number))
  const failedCharged = failed.filter(o => chargedNumbers.has(o.order_number)).length

  const byNumber = new Map(orders.map(o => [o.order_number, o]))
  const statusByNumber = new Map(orders.map(o => [o.order_number, o.status as string]))

  const s = summarize(rows)
  const cancelled = cancelledCharged(rows, statusByNumber)
  const digits = inconsistentDigits(rows)

  const OrderLink = ({ no }: { no: string }) => {
    const o = byNumber.get(no)
    return o
      ? <Link href={`/admin/book-fair/orders/${o.id}`} className="font-medium text-indigo-700 hover:underline" dir="ltr">{no}</Link>
      : <span className="font-medium text-slate-500" dir="ltr">{no}</span>
  }
  const Status = ({ no }: { no: string }) => {
    const st = byNumber.get(no)?.status
    return <span className="text-slate-600">{st ? BOOK_FAIR_STATUS_LABELS[st] ?? st : 'לא נמצאה'}</span>
  }

  const stats = [
    { label: 'חיובים באקסל', value: s.count.toLocaleString('he-IL') },
    { label: 'סך החיובים', value: fmtAgorot(s.total) },
    { label: 'הותאמו לפי מספר עסקה', value: s.transaction.toLocaleString('he-IL') },
    { label: 'הותאמו לפי סכום ושעה', value: s.amountTime.toLocaleString('he-IL') },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="סנכרון אשראי" subtitle="חיובי האשראי באקסל של נדרים מול ההזמנות במערכת (סנכרון 18.10.2026)" />

      {(error || failedError) && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">שגיאה בטעינה: {error ?? failedError}</p>}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(x => (
          <div key={x.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <dt className="text-xs text-slate-500">{x.label}</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-slate-900">{x.value}</dd>
          </div>
        ))}
      </dl>

      <Section title="תוקנו מ&quot;נכשל&quot; ל&quot;שולם&quot;" note="החיוב עבר באקסל, וההזמנה הייתה מסומנת כנכשלת." count={FIXED_FAILED_TO_PAID.length}>
        <OrderTable head={['הזמנה', 'סטטוס עכשיו']}
          rows={FIXED_FAILED_TO_PAID.map(no => [<OrderLink key="o" no={no} />, <Status key="s" no={no} />])} />
      </Section>

      <Section title="הזמנות מבוטלות שחויבו" note="צריך להחליט: להחזיר ל&quot;שולם&quot; או לזכות את הלקוח." count={cancelled.length} alert>
        <OrderTable head={['הזמנה', 'תאריך החיוב', 'סכום', 'כרטיס']}
          rows={cancelled.map(r => [
            <OrderLink key="o" no={r.order_number} />, fmtLocal(r.charged_at), fmtAgorot(r.amount_agorot),
            <span key="c" dir="ltr" className="tabular-nums">•••• {r.card_last4}</span>,
          ])} />
      </Section>

      <Section title="שולמו אצלנו ואין להן חיוב באקסל" note="ההזמנה מסומנת כשולמה, אבל באקסל אין חיוב שמתאים לה." count={PAID_WITHOUT_CHARGE.length} alert>
        <OrderTable head={['הזמנה', 'סטטוס', 'סכום']}
          rows={PAID_WITHOUT_CHARGE.map(no => [<OrderLink key="o" no={no} />, <Status key="s" no={no} />, fmtAgorot(byNumber.get(no)?.total_agorot)])} />
        <p className="mt-3 text-sm text-slate-600">
          גם ל-{MANUAL_REFUND_NO_CHARGE.map((no, i) => <span key={no}>{i > 0 && ', '}<OrderLink no={no} /></span>)} אין חיוב באקסל,
          אבל יש עליהן החזר ידני, ולכן הן כנראה תקינות.
        </p>
      </Section>

      <Section title="ספרות לא עקביות" note="הספרות באקסל שונות מהספרות ששמורות בתשלום במערכת. ההזמנה לא עודכנה." count={digits.length} alert>
        <OrderTable wide={[1]} head={['הזמנה', 'תאריך החיוב', 'סכום', 'באקסל', 'במערכת']}
          rows={digits.map(r => [
            <OrderLink key="o" no={r.order_number} />, fmtLocal(r.charged_at), fmtAgorot(r.amount_agorot),
            <span key="x" dir="ltr" className="tabular-nums">{r.card_last4}</span>,
            <span key="y" dir="ltr" className="tabular-nums">{r.system_last4}</span>,
          ])} />
      </Section>

      <Section title="תשלומים שנכשלו" note={`הזמנות בכרטיס אשראי בסטטוס "נכשל". ${failedCharged} מהן עם חיוב באקסל.`} count={failed.length} alert={failedCharged > 0}>
        <OrderTable head={['הזמנה', 'תאריך', 'סכום', 'חיוב באקסל']}
          rows={failed.map(o => [
            <Link key="o" href={`/admin/book-fair/orders/${o.id}`} className="font-medium text-indigo-700 hover:underline" dir="ltr">{o.order_number}</Link>,
            fmtDate(o.created_at), fmtAgorot(o.total_agorot),
            chargedNumbers.has(o.order_number) ? <span key="c" className="font-semibold text-red-700">יש</span> : 'אין',
          ])} />
      </Section>

      <details className="rounded-2xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer font-semibold text-slate-900">כל החיובים ({s.count.toLocaleString('he-IL')})</summary>
        <div className="mt-4">
          <OrderTable wide={[3, 4, 5, 6]} head={['הזמנה', 'תאריך החיוב', 'סכום', 'כרטיס', 'מספר עסקה', 'התאמה', 'סטייה (דק׳)']}
            rows={rows.map(r => [
              <OrderLink key="o" no={r.order_number} />, fmtLocal(r.charged_at), fmtAgorot(r.amount_agorot),
              <span key="c" dir="ltr" className="tabular-nums">{r.card_last4}</span>,
              <span key="t" dir="ltr" className="tabular-nums">{r.transaction_id}</span>,
              r.match_type === 'transaction' ? 'מספר עסקה' : 'סכום ושעה',
              r.deviation_minutes == null ? '—' : String(r.deviation_minutes),
            ])} />
        </div>
      </details>
    </div>
  )
}

function Section({ title, note, count, alert, children }: {
  title: string; note: string; count: number; alert?: boolean; children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        {title}
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${alert && count > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{count}</span>
      </h2>
      <p className="mb-3 mt-1 text-sm text-slate-500">{note}</p>
      {count > 0 ? children : <p className="text-sm text-slate-500">אין.</p>}
    </section>
  )
}

/** wide: עמודות שמוסתרות במסך צר, כדי שלא תהיה גלילה לרוחב. */
function OrderTable({ head, rows, wide = [] }: { head: string[]; rows: React.ReactNode[][]; wide?: number[] }) {
  const cls = (j: number) => (wide.includes(j) ? "hidden md:table-cell " : "")
  return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
            {head.map((h, j) => <th key={h} className={`${cls(j)}px-2 py-2 font-medium`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              {cells.map((c, j) => <td key={j} className={`${cls(j)}px-2 py-2 text-slate-800`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
  )
}
