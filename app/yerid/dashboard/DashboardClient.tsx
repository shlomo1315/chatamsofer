'use client'
import { useMemo, useState, useEffect } from 'react'
import { Loader2, LogOut, RefreshCw, X, Search } from 'lucide-react'
import { fmtAgorot } from '@/lib/bookFairPricing'
import {
  computeStats, filterOrders, bookDetail, DEFAULT_FILTERS, CHANNELS, CHANNEL_LABELS,
  type StatOrder, type StatItem, type StatFilters, type Channel, type Period,
} from '@/lib/bookFairStats'
import { Card, Kpi, BarList, HourBars, SplitBar, Pills, CH_COLORS } from '@/components/bookFair/StatCharts'
import { useLiveData, agoText, nextText } from '@/components/bookFair/useLiveData'

// ─────────────────────────────────────────────────────────────────────────────
// ניהול היריד — כל ההזמנות *ששולמו* מכל הערוצים, מספרים בלבד.
//
// 🔴 החישוב ב-lib/bookFairStats — אותה פונקציה של לשונית "דוכן היריד"
// בניהול. אותו יום ⇒ אותו מספר בשני המסכים.
//
// ⚠️ החלטות המשתמש (05.10):
//   · רק הזמנות ששולמו — בלי סינון סטטוס ובלי "מה לא נסגר".
//   · רענון כל 5 דקות + כפתור "עדכון עכשיו".
//   · כל טקסט גלוי במלואו — בלי "..." בשום מקום (אין truncate בקובץ).
//   · חיפוש חופשי לפי ספר, ופירוט מלא לכל ספר בתחתית.
// ─────────────────────────────────────────────────────────────────────────────

type Payload = { orders: StatOrder[]; items: StatItem[]; categories: Record<string, string>; at: string }

const REFRESH_MS = 30 * 1000
const NAVY = '#14213D'
const GOLD = '#B8862B'
const SELECT = 'min-h-[44px] min-w-0 rounded-xl border-0 bg-[#F4F1EA] px-3 text-[15px] text-[#14213D]'

export default function DashboardClient() {
  const { data, error, status, updatedAt, nextAt, reload } = useLiveData<Payload>('/api/yerid/dashboard/data', REFRESH_MS)
  const [f, setF] = useState<StatFilters>({ ...DEFAULT_FILTERS })
  const [bookQuery, setBookQuery] = useState('')
  const [detailBook, setDetailBook] = useState('')
  const [detailQuery, setDetailQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const set = <K extends keyof StatFilters>(k: K, v: StatFilters[K]) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    // ⚠️ כל שנייה — לספירה לאחור עד העדכון הבא.
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  async function refreshNow() {
    setRefreshing(true)
    try { await reload() } finally { setRefreshing(false); setNow(Date.now()) }
  }

  const categoryOf = useMemo(() => new Map(Object.entries(data?.categories ?? {})), [data])
  const categoryList = useMemo(() => [...new Set(categoryOf.values())].sort((a, b) => a.localeCompare(b, 'he')), [categoryOf])
  const bookTitles = useMemo(
    () => [...new Set((data?.items ?? []).map(i => i.title_snapshot))].sort((a, b) => a.localeCompare(b, 'he')),
    [data],
  )

  const view = useMemo(() => {
    if (!data) return null
    const nowD = new Date(now)
    // 🔴 תמיד status:'paid' — הלוח מציג רק הזמנות ששולמו.
    const rows = filterOrders(data.orders, data.items, categoryOf, { ...f, status: 'paid' }, nowD)
    const stats = computeStats(rows, data.items, categoryOf, f.category, f.book ?? 'all')
    return { rows, stats }
  }, [data, categoryOf, f, now])

  const detail = useMemo(
    () => (view && data && detailBook ? bookDetail(view.rows, data.items, detailBook) : null),
    [view, data, detailBook],
  )

  if (status === 401) return <Login onDone={() => void reload()} />

  if (!data || !view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F1EA]">
        {error ? <p className="px-6 text-center text-[#6B2737]">{error}</p> : <Loader2 className="animate-spin text-[#14213D]" />}
      </div>
    )
  }

  const s = view.stats
  const chTotal = CHANNELS.reduce((n, c) => n + s.byChannel[c].agorot, 0)
  let acc = 0
  const donut = CHANNELS.map(c => {
    const from = chTotal ? (acc / chTotal) * 100 : 0
    acc += s.byChannel[c].agorot
    const to = chTotal ? (acc / chTotal) * 100 : 0
    return `${CH_COLORS[c]} ${from}% ${to}%`
  }).join(', ')
  const dayMax = Math.max(...s.byDay.map(d => d.total), 1)
  const listedBooks = detailQuery.trim()
    ? s.allBooks.filter(b => b.title.includes(detailQuery.trim()))
    : s.allBooks

  function pickTopBook(v: string) {
    setBookQuery(v)
    // ⚠️ מסנן רק כשהוקלד שם מלא שקיים — הקלדה חלקית לא מאפסת את הלוח.
    if (bookTitles.includes(v)) set('book', v)
    else if (!v.trim()) set('book', 'all')
  }

  async function logout() {
    await fetch('/api/yerid/dashboard/login', { method: 'DELETE' }).catch(() => {})
    void reload()
  }

  return (
    <div className="min-h-screen bg-[#F4F1EA] text-[#14213D]">
      {/* ── כותרת וסינון ── */}
      <header className="bg-[#14213D] px-4 pt-5 text-[#F4F1EA] sm:px-10">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* ⚠️ הלוגו על משטח בהיר: הקובץ מיועד לרקע לבן, ועל הכחול הכהה
                חלקים ממנו נבלעו. */}
            <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-[#F4F1EA] p-1.5">
              <img src="/logo-heichal.png" alt="היכל החתם סופר" className="h-full w-full object-contain" />
            </span>
            <div>
              <h1 className="text-2xl font-bold leading-tight sm:text-[28px]">ניהול היריד</h1>
              <p className="mt-0.5 text-sm text-[#C9CFDB]">יריד הספרים · היכל החתם סופר</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${error ? 'bg-amber-400' : 'bg-[#4ADE80]'}`} />
              {error || `${agoText(updatedAt, now)} · ${nextText(nextAt, now)}`}
            </span>
            <button onClick={refreshNow} disabled={refreshing}
              className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#B8862B] px-4 text-sm font-bold text-[#14213D] disabled:opacity-60">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> עדכון עכשיו
            </button>
            <button onClick={logout} className="flex min-h-[44px] items-center gap-2 rounded-xl border border-[#F4F1EA]/35 px-4 text-sm font-semibold">
              <LogOut size={16} /> יציאה
            </button>
          </div>
        </div>

        <div className="mx-auto mt-5 flex max-w-[1360px] flex-wrap items-end gap-3 pb-5">
          <Field label="תקופה">
            <Pills<Period> dark value={f.period} onChange={v => set('period', v)} options={[
              { id: 'today', label: 'היום' }, { id: 'yesterday', label: 'אתמול' },
              { id: 'all', label: 'כל היריד' }, { id: 'range', label: 'טווח' },
            ]} />
          </Field>
          {f.period === 'range' && (
            <Field label="מתאריך – עד">
              <div className="flex flex-wrap gap-2">
                <input type="date" value={f.from ?? ''} onChange={e => set('from', e.target.value)} className={SELECT} aria-label="מתאריך" />
                <input type="date" value={f.to ?? ''} onChange={e => set('to', e.target.value)} className={SELECT} aria-label="עד תאריך" />
              </div>
            </Field>
          )}
          <Field label="ערוץ">
            <Pills<Channel | 'all'> dark value={f.channel} onChange={v => set('channel', v)} options={[
              { id: 'all', label: 'הכל', color: GOLD },
              ...CHANNELS.map(c => ({ id: c, label: CHANNEL_LABELS[c], color: c === 'web' ? '#6B8DE3' : CH_COLORS[c] })),
            ]} />
          </Field>
          {/* ── חיפוש חופשי לפי ספר ── */}
          <Field label="ספר">
            <div className="relative">
              <Search size={20} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5B6475]" />
              <input list="dash-books" value={bookQuery} onChange={e => pickTopBook(e.target.value)}
                placeholder="הקלידו שם ספר" aria-label="סינון לפי ספר"
                className={`${SELECT} w-[min(22rem,80vw)] pr-9 pl-9`} />
              {bookQuery && (
                <button type="button" onClick={() => pickTopBook('')} aria-label="ניקוי"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[#5B6475]">
                  <X size={16} />
                </button>
              )}
              <datalist id="dash-books">
                {bookTitles.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
          </Field>
          <Field label="קטגוריה">
            <select value={f.category} onChange={e => set('category', e.target.value)} className={SELECT}>
              <option value="all">כל הקטגוריות</option>
              {categoryList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="משלוח">
            <select value={f.delivery} onChange={e => set('delivery', e.target.value as StatFilters['delivery'])} className={SELECT}>
              <option value="all">הכל</option><option value="shipping">משלוח עד הבית</option><option value="pickup">איסוף עצמי</option>
            </select>
          </Field>
          <Field label="גודל הזמנה">
            <select value={f.size} onChange={e => set('size', e.target.value as StatFilters['size'])} className={SELECT}>
              <option value="all">כל הסכומים</option><option value="small">עד ₪200</option>
              <option value="medium">₪200–₪500</option><option value="large">מעל ₪500</option>
            </select>
          </Field>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 py-6 sm:px-10">
        {f.book && f.book !== 'all' && (
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-[#B8862B]/15 px-4 py-3 text-[15px] font-semibold">
            מוצגות רק הזמנות שכוללות את הספר: <span className="font-extrabold">{f.book}</span>
            <button onClick={() => pickTopBook('')} className="mr-auto rounded-lg bg-white px-3 py-1.5 text-sm">ביטול הסינון</button>
          </p>
        )}

        {/* ── מספרים ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi label="היקף מכירות" value={fmtAgorot(s.revenueAgorot)} sub={`מ-${s.orders} הזמנות ששולמו`} />
          <Kpi label="הזמנות" value={s.orders.toLocaleString('en-US')}
            sub={CHANNELS.map(c => `${s.byChannel[c].orders} ${CHANNEL_LABELS[c]}`).join(' · ')} />
          <Kpi highlight label="ספרים שנמכרו" value={s.units.toLocaleString('en-US')} />
        </div>

        {/* ── פירוט לפי ספר — כל הספרים, ולחיצה על ספר פותחת את כל הנתונים שלו ── */}
        <Card large title="פירוט לפי ספר" subtitle={`${s.allBooks.length} ספרים שנמכרו בתקופה ובסינון הנוכחיים`}>
          <div id="book-detail" className="flex flex-wrap gap-5">
            <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-3">
              <div className="relative">
                <Search size={20} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5B6475]" />
                <input value={detailQuery} onChange={e => setDetailQuery(e.target.value)} placeholder="חיפוש ספר"
                  aria-label="חיפוש ספר ברשימה"
                  className="min-h-[54px] w-full rounded-xl border border-[#E6E1D6] bg-white pr-11 pl-3 text-lg outline-none focus:border-[#B8862B]" />
              </div>
              <ul className="flex max-h-[46rem] flex-col overflow-y-auto rounded-xl border border-[#F0ECE3]">
                {listedBooks.map(b => (
                  <li key={b.title}>
                    <button type="button" onClick={() => setDetailBook(b.title)}
                      className={`flex w-full items-center gap-3 border-b border-[#F0ECE3] px-4 py-4 text-right last:border-0 ${detailBook === b.title ? 'bg-[#B8862B]/15' : 'hover:bg-[#F8F6F1]'}`}>
                      <span className="min-w-0 flex-1 break-words text-lg font-bold sm:text-xl">{b.title}</span>
                      <span className="whitespace-nowrap text-base font-semibold tabular-nums text-[#14213D]">{b.units} עותקים</span>
                    </button>
                  </li>
                ))}
                {!listedBooks.length && <li className="px-3 py-6 text-center text-base text-[#5B6475]">לא נמצא ספר</li>}
              </ul>
            </div>

            <div className="min-w-0 flex-[999_1_360px]">
              {detail ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="break-words text-2xl font-extrabold sm:text-3xl">{detail.title}</h3>
                    <button onClick={() => setDetailBook('')} className="rounded-lg border border-[#E6E1D6] px-4 py-2 text-base">סגירה</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Kpi label="עותקים" value={detail.units.toLocaleString('en-US')} />
                    <Kpi label="הכנסה מהספר" value={fmtAgorot(detail.agorot)} />
                    <Kpi label="הזמנות" value={detail.orders.toLocaleString('en-US')} />
                    <Kpi label="ממוצע להזמנה" value={detail.avgPerOrder.toFixed(1)} sub="עותקים" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-lg font-bold">לפי ערוץ (עותקים)</p>
                      <SplitBar parts={CHANNELS.map(c => ({ label: CHANNEL_LABELS[c], value: detail.byChannel[c].units, color: CH_COLORS[c], sub: `${detail.byChannel[c].units} · ${fmtAgorot(detail.byChannel[c].agorot)}` }))} />
                    </div>
                    <div>
                      <p className="mb-2 text-lg font-bold">משלוח מול איסוף (עותקים)</p>
                      <SplitBar parts={[
                        { label: 'משלוח', value: detail.delivery.shipping, color: NAVY, sub: `${detail.delivery.shipping}` },
                        { label: 'איסוף', value: detail.delivery.pickup, color: GOLD, sub: `${detail.delivery.pickup}` },
                      ]} />
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-lg font-bold">לפי יום</p>
                    <BarList money={false} color="#14213D" empty="אין מכירות"
                      rows={detail.byDay.map(d => ({ label: `${d.day.slice(8, 10)}.${d.day.slice(5, 7)}`, value: d.units, extra: fmtAgorot(d.agorot) }))} />
                  </div>
                  <div>
                    <p className="mb-2 text-lg font-bold">לפי שעה (עותקים)</p>
                    <HourBars hours={detail.byHour} />
                  </div>
                  <div>
                    <p className="mb-2 text-lg font-bold">לפי עיר (עותקים)</p>
                    <BarList money={false} color="#2A9D8F" empty="אין נתוני עיר (מכירות דוכן ואיסוף)"
                      rows={detail.cities.map(c => ({ label: c.name, value: c.units }))} />
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[260px] items-center justify-center rounded-xl bg-[#F8F6F1] p-6 text-center text-lg text-[#5B6475]">
                  בחרו ספר מהרשימה כדי לראות את כל הנתונים שלו
                </div>
              )}
            </div>
          </div>
        </Card>


        <div className="flex flex-wrap gap-5">
          <Card title="חלוקה לפי ערוץ" subtitle="לפי סכום ההכנסות" className="flex-[1_1_320px]">
            <div className="flex flex-wrap items-center gap-7">
              <div className="flex h-[180px] w-[180px] flex-shrink-0 items-center justify-center rounded-full"
                style={{ background: chTotal ? `conic-gradient(${donut})` : '#F0ECE3' }}>
                <div className="flex h-[116px] w-[116px] flex-col items-center justify-center rounded-full bg-white text-center">
                  <span className="text-xl font-extrabold tabular-nums">{fmtAgorot(s.revenueAgorot)}</span>
                  <span className="text-[13px] text-[#5B6475]">{s.orders} הזמנות</span>
                </div>
              </div>
              <ul className="flex min-w-[150px] flex-1 flex-col gap-3.5">
                {CHANNELS.map(c => (
                  <li key={c}>
                    <div className="flex items-center gap-2 text-base font-bold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: CH_COLORS[c] }} />
                      {CHANNEL_LABELS[c]}
                      <span className="mr-auto tabular-nums">{chTotal ? ((s.byChannel[c].agorot / chTotal) * 100).toFixed(1) : '0'}%</span>
                    </div>
                    <p className="pr-[18px] text-[13px] text-[#5B6475]">{s.byChannel[c].orders} הזמנות · {fmtAgorot(s.byChannel[c].agorot)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card title="הכנסות לפי יום" subtitle="מחולק לפי ערוץ · היום מוצג עד עכשיו" className="flex-[999_1_320px]">
            {s.byDay.length ? (
              <>
                {/* ⚠️ dir=ltr — הימים מסודרים משמאל לימין, מהמוקדם למאוחר (בקשת המשתמש). */}
                <div dir="ltr" className="flex h-56 items-end gap-3 border-b border-[#E6E1D6] px-2 sm:gap-6">
                  {s.byDay.map(d => (
                    <div key={d.day} className="flex h-full min-w-0 max-w-[150px] flex-1 flex-col justify-end gap-1.5">
                      <span className="text-center text-sm font-bold tabular-nums">{fmtAgorot(d.total)}</span>
                      <div className="flex h-[calc(100%-28px)] flex-col justify-end gap-[2px]">
                        {(['fair', 'web', 'phone'] as Channel[]).map((c, i, arr) => d[c] > 0 && (
                          <div key={c} title={`${CHANNEL_LABELS[c]}: ${fmtAgorot(d[c])}`}
                            className={arr.slice(0, i).every(x => d[x] === 0) ? 'rounded-t-lg' : ''}
                            style={{ height: `${(d[c] / dayMax) * 100}%`, background: CH_COLORS[c] }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div dir="ltr" className="flex gap-3 px-2 pt-2 sm:gap-6">
                  {s.byDay.map(d => (
                    <div key={d.day} dir="rtl" className="min-w-0 max-w-[150px] flex-1 text-center">
                      <p className="text-sm font-semibold" dir="ltr">{d.day.slice(8, 10)}.{d.day.slice(5, 7)}</p>
                      <p className="text-xs text-[#5B6475]">{d.orders} הזמנות</p>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="py-10 text-center text-sm text-[#5B6475]">אין הזמנות בתקופה</p>}
          </Card>
        </div>

        <div className="flex flex-wrap gap-5">
          <Card title="מכירות לפי קטגוריה" subtitle="סכום · מספר ספרים" className="flex-[999_1_320px]">
            <BarList rows={s.categories.map(c => ({ label: c.name, value: c.agorot, extra: `${c.units}` }))} />
          </Card>
          <Card title="הספרים המובילים" subtitle="לפי מספר עותקים · לחיצה פותחת פירוט מלא" className="flex-[1_1_300px]">
            {s.topBooks.length ? (
              <ol className="flex flex-col">
                {s.topBooks.map((b, i) => (
                  <li key={b.title}>
                    <button type="button" onClick={() => { setDetailBook(b.title); document.getElementById('book-detail')?.scrollIntoView({ behavior: 'smooth' }) }}
                      className="flex w-full items-start gap-3 border-b border-[#F0ECE3] py-2.5 text-right last:border-0 hover:bg-[#F8F6F1]">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#F4F1EA] text-sm font-extrabold text-[#8A6420]">{i + 1}</span>
                      <span className="min-w-0 flex-1 break-words text-[15px] font-semibold">{b.title}</span>
                      <span className="text-[17px] font-bold tabular-nums">{b.units}</span>
                      <span className="w-16 text-left text-[13px] tabular-nums text-[#5B6475]" dir="ltr">{fmtAgorot(b.agorot)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : <p className="py-6 text-center text-sm text-[#5B6475]">אין נתונים</p>}
          </Card>
        </div>

        <div className="flex flex-wrap gap-5">
          <Card title="מתי מזמינים" subtitle="מספר הזמנות לפי שעה ביום" className="flex-[999_1_320px]">
            <HourBars hours={s.byHour} />
          </Card>
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            <Card title="ערים מובילות">
              <BarList money={false} color="#2A9D8F" rows={s.cities.map(c => ({ label: c.name, value: c.orders }))} />
            </Card>
            <Card title="משלוח או איסוף">
              <SplitBar parts={[
                { label: 'משלוח עד הבית', value: s.delivery.shipping, color: NAVY, sub: `${s.delivery.shipping}` },
                { label: 'איסוף', value: s.delivery.pickup, color: GOLD, sub: `${s.delivery.pickup} · ${s.delivery.pickedUp} נאספו` },
              ]} />
            </Card>
          </div>
        </div>

        <p className="text-center text-[13px] text-[#5B6475]">מוצגות הזמנות ששולמו בלבד · מספרים בלבד — ללא שמות, טלפונים או כתובות של לקוחות</p>
      </main>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold text-[#C9CFDB]">{label}</span>
      {children}
    </div>
  )
}

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/yerid/dashboard/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'הכניסה נכשלה'); return }
      setPw(''); onDone()
    } catch {
      setErr('הכניסה נכשלה — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#14213D] px-4">
      <form onSubmit={submit} className="flex w-full max-w-[420px] flex-col gap-5 rounded-3xl bg-[#F4F1EA] px-8 py-10 text-[#14213D]">
        <img src="/logo-heichal.png" alt="היכל החתם סופר" className="h-24 w-auto self-center object-contain" />
        <div className="text-center">
          <h1 className="text-3xl font-bold">ניהול היריד</h1>
          <p className="mt-2 text-[15px] text-[#5B6475]">יריד הספרים · היכל החתם סופר</p>
        </div>
        <label className="flex flex-col gap-2 text-[15px] font-semibold">
          סיסמה
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus dir="ltr"
            autoComplete="current-password"
            className="min-h-[52px] rounded-2xl border border-[#D8D1C2] bg-white px-4 text-lg outline-none focus:border-[#B8862B]" />
        </label>
        {err && <p className="rounded-xl bg-[#6B2737]/10 px-4 py-3 text-sm text-[#6B2737]">{err}</p>}
        <button type="submit" disabled={busy || !pw}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#14213D] text-[17px] font-bold text-[#F4F1EA] disabled:opacity-50">
          {busy && <Loader2 size={18} className="animate-spin" />} כניסה
        </button>
        <p className="text-center text-[13px] text-[#5B6475]">הסיסמה נקבעת בהגדרות היריד במערכת הניהול</p>
      </form>
    </div>
  )
}
