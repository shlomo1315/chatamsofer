'use client'
import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { Banknote, CreditCard, Loader2, AlertTriangle } from 'lucide-react'
import { fmtAgorot } from '@/lib/bookFairPricing'
import {
  computeStats, filterOrders, statusGroup, israelDay, DEFAULT_FILTERS,
  type StatOrder, type StatItem, type Period,
} from '@/lib/bookFairStats'
import { BOOK_FAIR_STATUS_LABELS, type BookFairOrderStatus } from '@/types/bookFair'
import { Card, Kpi, BarList, HourBars, SplitBar, Pills } from '@/components/bookFair/StatCharts'
import { useLiveData, agoText } from '@/components/bookFair/useLiveData'

// ─────────────────────────────────────────────────────────────────────────────
// לשונית "דוכן היריד" — כל מה שנמכר בדוכן, חי.
//
// 🔴 החישוב ב-lib/bookFairStats — אותה פונקציה של לוח המנהל, כדי ששני
// המסכים יציגו אותו מספר לאותו יום.
// ─────────────────────────────────────────────────────────────────────────────

type Payload = { orders: StatOrder[]; items: StatItem[]; categories: Record<string, string>; at: string }
type Pay = 'all' | 'cash' | 'card'

const CASH = '#2D5016'
const CARD = '#12314F'

export default function StandClient() {
  const { data, error, updatedAt } = useLiveData<Payload>('/api/admin/book-fair/stand')
  const [period, setPeriod] = useState<Period>('today')
  const [pay, setPay] = useState<Pay>('all')
  const [seller, setSeller] = useState('all')
  const [now, setNow] = useState(() => Date.now())

  // שעון לשורת "עודכן לפני X שניות".
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])

  const categoryOf = useMemo(() => new Map(Object.entries(data?.categories ?? {})), [data])

  const view = useMemo(() => {
    if (!data) return null
    const nowD = new Date(now)
    const paid = filterOrders(data.orders, data.items, categoryOf, { ...DEFAULT_FILTERS, period }, nowD)
    const sellers = [...new Set(paid.map(o => (o.sold_by ?? '').trim() || 'ללא שם'))].sort()
    const scoped = paid.filter(o =>
      (pay === 'all' || (pay === 'cash' ? o.payment_method === 'cash' : o.payment_method !== 'cash')) &&
      (seller === 'all' || ((o.sold_by ?? '').trim() || 'ללא שם') === seller))
    const stats = computeStats(scoped, data.items, categoryOf)
    // ⚠️ סליקות שנפתחו ולא הושלמו — היום בלבד, אחרת הרשימה רק גדלה.
    const today = israelDay(nowD)
    const pendingToday = data.orders.filter(o => statusGroup(o.status) === 'pending' && israelDay(new Date(o.created_at)) === today).length
    const itemsBy = new Map<string, StatItem[]>()
    for (const it of data.items) itemsBy.set(it.order_id, [...(itemsBy.get(it.order_id) ?? []), it])
    const list = [...data.orders]
      .filter(o => period === 'all' || filterOrders([o], [], categoryOf, { ...DEFAULT_FILTERS, period, status: statusGroup(o.status) }, nowD).length)
      .filter(o => (pay === 'all' || (pay === 'cash' ? o.payment_method === 'cash' : o.payment_method !== 'cash')) &&
        (seller === 'all' || ((o.sold_by ?? '').trim() || 'ללא שם') === seller))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 150)
    return { stats, sellers, pendingToday, list, itemsBy }
  }, [data, categoryOf, period, pay, seller, now])

  if (!data) {
    return error
      ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      : <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
  }
  const s = view!.stats

  return (
    <div className="flex flex-col gap-5">
      {/* ── סרגל סינון + מצב חי ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pills<Period> value={period} onChange={setPeriod} options={[
            { id: 'today', label: 'היום' }, { id: 'yesterday', label: 'אתמול' }, { id: 'all', label: 'כל היריד' },
          ]} />
          <Pills<Pay> value={pay} onChange={setPay} options={[
            { id: 'all', label: 'כל התשלומים' }, { id: 'cash', label: 'מזומן', color: CASH }, { id: 'card', label: 'אשראי', color: CARD },
          ]} />
          {view!.sellers.length > 1 && (
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              מוכר
              <select value={seller} onChange={e => setSeller(e.target.value)}
                className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm">
                <option value="all">כולם</option>
                {view!.sellers.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
        </div>
        <span className="flex items-center gap-2 text-sm text-slate-500">
          <span className={`h-2.5 w-2.5 rounded-full ${error ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          {error || agoText(updatedAt, now)}
        </span>
      </div>

      {/* ── מספרים ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="הכנסות" value={fmtAgorot(s.revenueAgorot)} sub={`${s.orders} מכירות`} />
        <Kpi label="ספרים שנמכרו" value={s.units.toLocaleString('en-US')} sub={s.orders ? `ממוצע ${(s.units / s.orders).toFixed(1)} למכירה` : undefined} />
        <Kpi label="מכירה ממוצעת" value={fmtAgorot(s.avgAgorot)} />
        <Kpi label="מזומן" value={fmtAgorot(s.byPayment.cash.agorot)} sub={`${s.byPayment.cash.orders} מכירות`} />
        <Kpi label="אשראי" value={fmtAgorot(s.byPayment.card.agorot)} sub={`${s.byPayment.card.orders} מכירות`} />
      </div>

      {view!.pendingToday > 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="flex-shrink-0" />
          {view!.pendingToday} סליקות אשראי נפתחו היום ולא הושלמו — לא נספרות בהכנסות.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="מזומן מול אשראי" subtitle="לפי סכום">
          <SplitBar parts={[
            { label: 'מזומן', value: s.byPayment.cash.agorot, color: CASH, sub: fmtAgorot(s.byPayment.cash.agorot) },
            { label: 'אשראי', value: s.byPayment.card.agorot, color: CARD, sub: fmtAgorot(s.byPayment.card.agorot) },
          ]} />
        </Card>
        <Card title="לפי מוכר" subtitle="סכום · מספר מכירות">
          <BarList color="#2A9D8F" empty="אין מכירות בתקופה"
            rows={s.bySeller.map(x => ({ label: x.name, value: x.agorot, extra: `${x.orders}` }))} />
        </Card>
        <Card title="מתי קונים" subtitle="מכירות לפי שעה">
          <HourBars hours={s.byHour} />
        </Card>
        <Card title="הנמכרים ביותר בדוכן" subtitle="לפי עותקים">
          <BarList money={false} empty="אין מכירות בתקופה"
            rows={s.topBooks.map(b => ({ label: b.title, value: b.units, extra: fmtAgorot(b.agorot) }))} />
        </Card>
      </div>

      {/* ── רשימת המכירות ──
          ⚠️ כרטיסים ולא טבלה רחבה: אין גלילה לרוחב (כלל הלינט), והמסך
          נפתח גם בטלפון ליד הדוכן. */}
      <Card title="מכירות בדוכן" subtitle={`${view!.list.length} אחרונות בתקופה`}>
        {view!.list.length ? (
          <ul className="divide-y divide-slate-100">
            {view!.list.map(o => {
              const its = view!.itemsBy.get(o.id) ?? []
              const qty = its.reduce((n, i) => n + i.quantity, 0)
              const g = statusGroup(o.status)
              return (
                <li key={o.id}>
                  <Link href={`/admin/book-fair/orders/${o.id}`}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 transition hover:bg-slate-50 sm:gap-4">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${o.payment_method === 'cash' ? 'bg-[#2D5016]/10 text-[#2D5016]' : 'bg-[#12314F]/10 text-[#12314F]'}`}
                      title={o.payment_method === 'cash' ? 'מזומן' : 'אשראי'}>
                      {o.payment_method === 'cash' ? <Banknote size={19} /> : <CreditCard size={19} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-slate-900">
                        {o.order_number} · {qty} {qty === 1 ? 'ספר' : 'ספרים'}
                        {g !== 'paid' && (
                          <span className={`mr-2 rounded-md px-1.5 py-0.5 text-xs ${g === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                            {BOOK_FAIR_STATUS_LABELS[o.status as BookFairOrderStatus] ?? o.status}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-sm text-slate-500">
                        {new Date(o.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {' · '}{(o.sold_by ?? '').trim() || 'ללא שם'}
                        {its.length > 0 && ` · ${its.map(i => i.title_snapshot).join(', ')}`}
                      </span>
                    </span>
                    <span className={`text-lg font-bold tabular-nums ${g === 'paid' ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                      {fmtAgorot(o.total_agorot)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">אין מכירות בתקופה שנבחרה</p>
        )}
      </Card>
    </div>
  )
}
