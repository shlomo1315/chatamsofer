'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X, Download, SlidersHorizontal, History } from 'lucide-react'
import { useCan } from '@/components/StaffPermissions'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Pagination from '@/components/ui/Pagination'
import { useTablePagination } from '@/lib/useTablePagination'
import { downloadXlsx, todayStamp } from '@/lib/downloadXlsx'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { ilDateTime } from '@/lib/israelTime'
import {
  buildBookRows, groupByParty, partyStatus, adjustmentTrail, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PARTY_STATUS_LABELS,
  type AuthorPayment, type BookSale, type SettlementBook, type SettlementRow, type PaymentMethod,
  type PartyRow, type PartyStatus,
} from '@/lib/bookFairSettlement'

// ─────────────────────────────────────────────────────────────────────────────
// דוח ההתחשבנות (לפי המוקאפ של ארי, 14.10): שורה לכל מחבר/מכון/מו"ל, שנפתחת
// לספרים שלו, לתשלומים ולטופס רישום תשלום.
//
// 🔴 "התאמת נמכר" אינה זיכוי: ההזמנות לא משתנות, ואף לקוח לא מקבל כסף.
// היא מתקנת רק את הספירה בדוחות (למשל טעות ברישום בדוכן).
// ⚠️ בלי גלילה לרוחב: במובייל כל שורה היא כרטיס.
// ─────────────────────────────────────────────────────────────────────────────

export type AdjustmentLog = {
  id: string; book_id: string; delta: number; amount_agorot: number
  reason: string; created_at: string; by: string | null
}
export type PaymentLog = AuthorPayment & { created_at: string; by: string | null }

type Filter = 'all' | 'open' | 'paid'
type View = 'report' | 'log'

const field = 'w-full min-h-10 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none'
const num = 'tabular-nums'
const btn = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50'
const primary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50'
// עמודות שורת הגורם בדסקטופ (כמו במוקאפ): שם · עותקים · נגבה · אחרי 5% · שולם · יתרה · מצב
const grid = 'md:grid md:grid-cols-[2.2fr_.8fr_1.1fr_1.1fr_1.1fr_1.1fr_1fr] md:items-center md:gap-2'

const STATUS_STYLE: Record<PartyStatus, string> = {
  paid: 'bg-emerald-50 text-emerald-700',
  partial: 'bg-amber-50 text-amber-700',
  unpaid: 'bg-slate-100 text-slate-600',
  missing: 'bg-red-50 text-red-700',
}

export default function SettlementClient({ books, sales, adjustments, payments, error }: {
  books: (SettlementBook & { price_agorot: number })[]
  sales: BookSale[]
  adjustments: AdjustmentLog[]
  payments: PaymentLog[]
  error: string | null
}) {
  const router = useRouter()
  const canEdit = useCan('book_fair', 'edit')
  const { confirm, confirmDialog } = useConfirm()
  const [view, setView] = useState<View>('report')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState<SettlementRow | null>(null)
  const [exporting, setExporting] = useState(false)

  const rows = useMemo(() => buildBookRows(books, sales, adjustments), [books, sales, adjustments])
  const parties = useMemo(() => groupByParty(rows, payments), [rows, payments])
  const priceOf = useMemo(() => new Map(books.map(b => [b.id, b.price_agorot])), [books])
  const titleOf = useMemo(() => new Map(books.map(b => [b.id, b.title])), [books])
  const rowsOf = useMemo(() => {
    const m = new Map<string, SettlementRow[]>()
    for (const r of rows) m.set(r.party, [...(m.get(r.party) ?? []), r])
    return m
  }, [rows])

  const totals = useMemo(() => parties.reduce(
    (t, p) => ({ collected: t.collected + p.collected, net: t.net + p.net, paid: t.paid + p.paid }),
    { collected: 0, net: 0, paid: 0 },
  ), [parties])

  const counts = useMemo(() => ({
    all: parties.length,
    open: parties.filter(p => p.balance > 0).length,
    paid: parties.filter(p => partyStatus(p) === 'paid').length,
  }), [parties])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const has = (s: string | null) => (s ?? '').toLowerCase().includes(q)
    return parties.filter(p => {
      if (filter === 'open' && p.balance <= 0) return false
      if (filter === 'paid' && partyStatus(p) !== 'paid') return false
      if (!q) return true
      return has(p.party) || (rowsOf.get(p.party) ?? []).some(r => has(r.title) || has(r.sku) || has(r.author))
    })
  }, [parties, rowsOf, filter, query])
  const pg = useTablePagination(shown)

  async function cancelPayment(p: PaymentLog) {
    const ok = await confirm({
      message: `לבטל את התשלום של ${fmtAgorot(p.amount_agorot)} ל${p.payee}? התשלום יישאר ברשימה כמבוטל.`,
      danger: true,
    })
    if (!ok) return
    const res = await fetch('/api/admin/book-fair/settlement/payments', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }),
    })
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? 'הביטול נכשל'); return }
    router.refresh()
  }

  async function exportXlsx() {
    setExporting(true)
    const shekel = (a: number) => a / 100
    try {
      await downloadXlsx({
        filename: `התחשבנות יריד הספרים ${todayStamp()}`,
        sheetName: 'התחשבנות',
        columns: [
          { header: 'מחבר/מכון/מו"ל', width: 28 }, { header: 'ספר', width: 32 }, { header: 'מק"ט' },
          { header: 'עותקים', kind: 'number' }, { header: 'נגבה', kind: 'number' }, { header: 'אחרי 5%', kind: 'number' },
          { header: 'שולם', kind: 'number' }, { header: 'יתרה', kind: 'number' }, { header: 'מצב' },
        ],
        // שורת סיכום לכל גורם, ומתחתיה הספרים שלו
        rows: shown.flatMap(p => [
          [p.party, `סה"כ (${p.books} ספרים)`, '', p.qty, shekel(p.collected), shekel(p.net),
           shekel(p.paid), shekel(p.balance), PARTY_STATUS_LABELS[partyStatus(p)]],
          ...(rowsOf.get(p.party) ?? []).map(r => [
            p.party, r.title, r.sku ?? '', r.qty, shekel(r.collected), shekel(r.net), null, null, '',
          ]),
        ]),
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'הייצוא נכשל')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          חלק מהנתונים לא נטען. אם זו הפעם הראשונה, צריך להריץ את המיגרציה <span className="font-mono">20261014_book_fair_settlement.sql</span>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="נגבה בסך הכול" value={fmtAgorot(totals.collected)} />
        <Stat label="לתשלום אחרי 5%" value={fmtAgorot(totals.net)} accent />
        <Stat label="שולם עד כה" value={fmtAgorot(totals.paid)} />
        <Stat label="יתרה לתשלום" value={fmtAgorot(totals.net - totals.paid)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {view === 'report' && (
          <>
            <div className="flex overflow-hidden rounded-[10px] border border-slate-200 bg-white text-sm">
              {([['all', 'הכול'], ['open', 'יש יתרה'], ['paid', 'שולם במלואו']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  aria-pressed={filter === k}
                  className={`min-h-10 px-3.5 py-2 transition ${filter === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {label} · <span className={num}>{counts[k]}</span>
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder='חיפוש מחבר, מו"ל או ספר'
              className={`${field} min-w-[200px] flex-1`}
            />
            <button onClick={exportXlsx} disabled={exporting || !shown.length} className={btn}>
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} ייצוא לאקסל
            </button>
          </>
        )}
        <button onClick={() => setView(view === 'report' ? 'log' : 'report')} className={`${btn} ms-auto`}>
          <History size={15} /> {view === 'report' ? 'יומן תשלומים והתאמות' : 'חזרה לדוח'}
        </button>
      </div>

      {view === 'report' && (
        <div className="md:rounded-xl md:border md:border-slate-200 md:bg-white">
          <div className={`hidden border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 ${grid}`}>
            <div>מחבר / מכון / מו&quot;ל</div><div className="text-end">עותקים</div><div className="text-end">נגבה</div><div className="text-end">אחרי 5%</div>
            <div className="text-end">שולם</div><div className="text-end">יתרה</div><div>מצב</div>
          </div>
          <ul className="flex flex-col gap-2 md:gap-0">
            {pg.rows.map(p => (
              <PartyItem
                key={p.party}
                p={p}
                books={rowsOf.get(p.party) ?? []}
                priceOf={priceOf}
                payments={payments.filter(x => x.payee === p.party)}
                expanded={open === p.party}
                canEdit={canEdit}
                onToggle={() => setOpen(open === p.party ? null : p.party)}
                onAdjust={setAdjusting}
                onCancel={cancelPayment}
                onPaid={() => router.refresh()}
              />
            ))}
            {!pg.rows.length && <li className="rounded-xl border border-slate-200 bg-white px-4 py-12 md:rounded-none md:border-0 text-center text-sm text-slate-400">אין נתונים להצגה</li>}
          </ul>
          <div className="pt-3 md:px-3 md:pb-3">
            <Pagination page={pg.page} size={pg.size} total={pg.total} onPage={pg.setPage} onSize={pg.setSize} />
          </div>
        </div>
      )}

      {view === 'log' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">תשלומים למחברים ({payments.length})</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {payments.map(p => (
                <li key={p.id} className={`flex flex-wrap items-start justify-between gap-2 py-2.5 ${p.cancelled_at ? 'opacity-50' : ''}`}>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800">
                      {p.payee} · <span className={num}>{fmtAgorot(p.amount_agorot)}</span>
                      {p.cancelled_at && <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">בוטל</span>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {PAYMENT_METHOD_LABELS[p.method]} · {fmtDate(p.paid_on)}{p.by && ` · נרשם ע"י ${p.by}`}
                    </div>
                    {p.note && <div className="mt-0.5 text-xs text-slate-600">{p.note}</div>}
                  </div>
                  {canEdit && !p.cancelled_at && (
                    <button onClick={() => cancelPayment(p)} className="text-xs text-slate-500 hover:text-red-700">ביטול</button>
                  )}
                </li>
              ))}
              {!payments.length && <li className="py-6 text-center text-slate-400">טרם נרשמו תשלומים</li>}
            </ul>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">יומן עדכוני כמות ({adjustments.length})</h2>
            <AdjustmentList items={adjustments} titleOf={titleOf} />
          </section>
        </div>
      )}

      {adjusting && (
        <AdjustDialog
          row={adjusting}
          price={priceOf.get(adjusting.bookId) ?? 0}
          history={adjustments.filter(a => a.book_id === adjusting.bookId)}
          onClose={() => setAdjusting(null)}
          onDone={() => { setAdjusting(null); router.refresh() }}
        />
      )}
      {confirmDialog}
    </div>
  )
}

function PartyItem({ p, books, priceOf, payments, expanded, canEdit, onToggle, onAdjust, onCancel, onPaid }: {
  p: PartyRow
  books: SettlementRow[]
  priceOf: Map<string, number>
  payments: PaymentLog[]
  expanded: boolean
  canEdit: boolean
  onToggle: () => void
  onAdjust: (r: SettlementRow) => void
  onCancel: (p: PaymentLog) => void
  onPaid: () => void
}) {
  const status = partyStatus(p)
  const missing = status === 'missing'
  const pill = `inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`
  const mth = 'border-b border-slate-200 px-1.5 py-2 text-right text-xs font-semibold text-slate-500'
  const mtd = 'border-b border-slate-200 px-1.5 py-2 align-top'
  return (
    <li className={`overflow-hidden rounded-xl border border-slate-200 bg-white md:rounded-none md:border-x-0 md:border-b-0 md:first:border-t-0 ${expanded ? 'md:bg-[#fbfbff]' : ''}`}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className={`block w-full p-4 text-right text-sm hover:bg-slate-50 md:py-3 ${grid}`}
      >
        <div className="mb-2 flex items-start justify-between gap-2 md:mb-0 md:block">
          <div className="min-w-0">
            <div className="font-semibold text-slate-900">{p.party}</div>
            <div className="text-xs text-slate-500">
              {p.books === 1 ? "1 ספר" : `${p.books} ספרים`}
              <span className="md:hidden"> · {p.qty} עותקים</span>
              {missing && ' · יש להשלים בקטלוג'}
            </div>
          </div>
          <span className={`${pill} shrink-0 md:hidden`}>{PARTY_STATUS_LABELS[status]}</span>
        </div>
        <div className={`hidden text-end md:block ${num}`}>{p.qty}</div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 md:contents">
          <Cell label="נגבה" value={fmtAgorot(p.collected)} />
          <Cell label="אחרי 5%" value={fmtAgorot(p.net)} />
          <Cell label="שולם" value={fmtAgorot(p.paid)} />
          <Cell label="יתרה" value={fmtAgorot(p.balance)}
                cls={p.balance < 0 ? 'text-red-700' : p.balance > 0 ? 'md:font-bold' : ''} />
        </dl>
        <div className="hidden md:block"><span className={pill}>{PARTY_STATUS_LABELS[status]}</span></div>
      </button>

      {expanded && (
        <div className="grid gap-6 border-t border-slate-200 bg-[#fbfbff] p-4 md:grid-cols-[1.4fr_1fr]">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-500">ספרים</h3>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={mth}>ספר</th>
                  <th className={`${mth} text-end`}>נמכר</th>
                  <th className={`${mth} hidden text-end sm:table-cell`}>מחיר</th>
                  <th className={`${mth} text-end`}>נגבה</th>
                  <th className={`${mth} text-end`}>אחרי 5%</th>
                </tr>
              </thead>
              <tbody>
                {books.map(r => (
                  <tr key={r.bookId}>
                    <td className={`${mtd} text-slate-800`}>
                      {r.title}
                      {canEdit && (
                        <button onClick={() => onAdjust(r)}
                                className="mt-0.5 flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline">
                          <SlidersHorizontal size={12} /> עדכון כמות
                        </button>
                      )}
                    </td>
                    <td className={`${mtd} text-end ${num}`}>
                      {r.qty}
                      <div className="whitespace-nowrap text-xs text-slate-500">
                        דוכן {r.byChannel.fair} · אתר {r.byChannel.web} · טלפון {r.byChannel.phone}
                      </div>
                      {r.adjQty !== 0 && (
                        <div className="whitespace-nowrap text-xs text-amber-700" title={`לפי ההזמנות ${r.orderedQty}. ההזמנות לא שונו.`}>
                          התאמה ידנית: <span dir="ltr">{r.adjQty > 0 ? '+' : ''}{r.adjQty}</span>
                        </div>
                      )}
                    </td>
                    <td className={`${mtd} hidden text-end sm:table-cell ${num}`}>{fmtAgorot(priceOf.get(r.bookId) ?? 0)}</td>
                    <td className={`${mtd} text-end ${num}`}>{fmtAgorot(r.collected)}</td>
                    <td className={`${mtd} text-end ${num}`}>{fmtAgorot(r.net)}</td>
                  </tr>
                ))}
                {!books.length && (
                  <tr><td colSpan={5} className="py-4 text-center text-slate-400">אין ספרים שנמכרו</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-500">תשלומים</h3>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={mth}>תאריך</th>
                  <th className={mth}>אמצעי</th>
                  <th className={`${mth} text-end`}>סכום</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(x => (
                  <tr key={x.id} className={x.cancelled_at ? 'opacity-50' : ''}>
                    <td className={`${mtd} ${num}`}>{fmtDate(x.paid_on)}</td>
                    <td className={mtd}>
                      {PAYMENT_METHOD_LABELS[x.method]}{x.note && ` · ${x.note}`}
                      {x.cancelled_at && <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">בוטל</span>}
                    </td>
                    <td className={`${mtd} text-end ${num}`}>
                      {fmtAgorot(x.amount_agorot)}
                      {canEdit && !x.cancelled_at && (
                        <button onClick={() => onCancel(x)} className="block w-full text-end text-xs text-slate-500 hover:text-red-700">ביטול</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!payments.length && (
                  <tr><td colSpan={3} className="py-4 text-center text-slate-400">טרם שולם</td></tr>
                )}
              </tbody>
            </table>
            {canEdit && !missing && (
              <PaymentForm key={p.balance} payee={p.party} balance={p.balance} onCancel={onToggle} onDone={onPaid} />
            )}
          </section>
        </div>
      )}
    </li>
  )
}

function Cell({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="md:text-end">
      <dt className="text-xs text-slate-500 md:hidden">{label}</dt>
      <dd className={`font-semibold text-slate-900 md:font-normal ${num} ${cls}`}>{value}</dd>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'border-indigo-200 bg-[#fafaff]' : 'border-slate-200 bg-white'}`}>
      <div className="text-[13px] text-slate-600">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accent ? 'text-indigo-700' : 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

function AdjustmentList({ items, titleOf }: { items: AdjustmentLog[]; titleOf: Map<string, string> }) {
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {items.map(a => (
        <li key={a.id} className="py-2.5">
          <div className="font-medium text-slate-800">
            {titleOf.get(a.book_id) ?? 'ספר שנמחק'} · <span className={num}>{a.delta > 0 ? '+' : ''}{a.delta}</span> עותקים
            <span className={`mr-1 text-xs text-slate-500 ${num}`}>({fmtAgorot(a.amount_agorot)})</span>
          </div>
          <div className="text-xs text-slate-500">{ilDateTime(a.created_at)}{a.by && ` · ${a.by}`}</div>
          <div className="mt-0.5 text-xs text-slate-600">{a.reason}</div>
        </li>
      ))}
      {!items.length && <li className="py-6 text-center text-slate-400">אין עדכוני כמות</li>}
    </ul>
  )
}

function fmtDate(d: string) {
  const [y, m, day] = d.slice(0, 10).split('-')
  return y && m && day ? `${day}.${m}.${y}` : d
}

async function post(url: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (res.ok) return null
  return (await res.json().catch(() => ({}))).error ?? 'השמירה נכשלה'
}

function PaymentForm({ payee, balance, onCancel, onDone }: {
  payee: string; balance: number; onCancel: () => void; onDone: () => void
}) {
  const [amount, setAmount] = useState(balance > 0 ? String(balance / 100) : '')
  const [method, setMethod] = useState<PaymentMethod>('transfer')
  const [paidOn, setPaidOn] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }))
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setBusy(true); setErr('')
    // אסמכתא והערה נשמרות יחד בשדה ההערה
    const full = [ref.trim() && `אסמכתא ${ref.trim()}`, note.trim()].filter(Boolean).join(' · ')
    const e = await post('/api/admin/book-fair/settlement/payments', { payee, amount, method, paidOn, note: full })
    setBusy(false)
    if (e) setErr(e); else onDone()
  }

  const lbl = 'flex flex-col gap-1 text-xs text-slate-600'
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <label className={lbl}>תאריך
        <input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} className={field} />
      </label>
      <label className={lbl}>סכום
        <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className={`${field} ${num}`} />
      </label>
      <label className={lbl}>אמצעי
        <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className={field}>
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
        </select>
      </label>
      <label className={lbl}>אסמכתא / מס׳ צ׳ק
        <input value={ref} onChange={e => setRef(e.target.value)} maxLength={80} placeholder="לא חובה" className={field} />
      </label>
      <label className={`${lbl} col-span-2`}>הערה
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="לא חובה" className={field} />
      </label>
      {err && <div className="col-span-2 text-sm text-red-700">{err}</div>}
      <div className="col-span-2 flex justify-end gap-2">
        <button onClick={onCancel} className={btn}>ביטול</button>
        <button onClick={save} disabled={busy} className={primary}>
          {busy && <Loader2 size={15} className="animate-spin" />} רישום תשלום
        </button>
      </div>
    </div>
  )
}

function AdjustDialog({ row, price, history, onClose, onDone }: {
  row: SettlementRow; price: number; history: AdjustmentLog[]; onClose: () => void; onDone: () => void
}) {
  const [target, setTarget] = useState(String(row.qty))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const n = Number(target)
  const delta = target.trim() !== '' && Number.isInteger(n) && n >= 0 ? n - row.qty : null
  const trail = adjustmentTrail(row.qty, history)

  async function save() {
    if (delta === null || delta === 0) { setErr('הזן כמות אחרת מהכמות הנוכחית'); return }
    if (!reason.trim()) { setErr('כתוב סיבה קצרה'); return }
    setBusy(true); setErr('')
    const e = await post('/api/admin/book-fair/settlement/adjustments', { bookId: row.bookId, delta, reason })
    setBusy(false)
    if (e) setErr(e); else onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="adjust-title"
        className="max-h-[90vh] w-full max-w-[440px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 id="adjust-title" className="text-lg font-bold text-slate-900">{row.title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="סגירה"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          לפי ההזמנות נמכרו {row.orderedQty} עותקים. כמה נמכרו בפועל?
        </p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-[10px] border border-slate-200 px-3 py-2.5">
            <div className="text-xs text-slate-600">לפי ההזמנות</div>
            <div className={`text-xl font-bold ${num}`}>{row.orderedQty}</div>
          </div>
          <label className="flex flex-col rounded-[10px] border border-slate-200 px-3 py-2.5 text-xs text-slate-600">נמכר בפועל
            <input value={target} onChange={e => setTarget(e.target.value)} inputMode="numeric"
                   className={`${field} mt-1 text-xl font-bold ${num}`} />
          </label>
        </div>
        {delta !== null && delta !== 0 && (
          <div className={`-mt-2 mb-3 text-xs text-slate-500 ${num}`}>
            שינוי של {delta > 0 ? '+' : ''}{delta} עותקים · {fmtAgorot(delta * price)} בסכום שנגבה. ההזמנות לא משתנות.
          </div>
        )}
        <label className="flex flex-col gap-1 text-xs text-slate-600">סיבה (חובה)
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={300}
                 placeholder="לדוגמה: עותק פגום הוחזר בדוכן" className={field} />
        </label>
        {err && <div className="mt-2 text-sm text-red-700">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className={btn}>ביטול</button>
          <button onClick={save} disabled={busy} className={primary}>
            {busy && <Loader2 size={15} className="animate-spin" />} שמירה
          </button>
        </div>
        {trail.length > 0 && (
          <div className="mt-4 border-t border-slate-200 pt-2 text-[13px] text-slate-600">
            היסטוריה:
            <ul className="mt-1 flex flex-col gap-1">
              {trail.map(a => (
                <li key={a.id} className={num}>
                  {fmtDate(a.created_at)}{a.by && ` · ${a.by}`} · {a.before} ← {a.after} · &quot;{a.reason}&quot;
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
