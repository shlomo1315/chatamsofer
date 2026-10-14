'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X, Wallet, SlidersHorizontal } from 'lucide-react'
import { useCan } from '@/components/StaffPermissions'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Pagination from '@/components/ui/Pagination'
import { useTablePagination } from '@/lib/useTablePagination'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { ilDateTime } from '@/lib/israelTime'
import {
  buildBookRows, groupByParty, PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
  type AuthorPayment, type BookSale, type SettlementBook, type SettlementRow, type PaymentMethod,
} from '@/lib/bookFairSettlement'

// ─────────────────────────────────────────────────────────────────────────────
// דוח ההתחשבנות — שלוש תצוגות: לפי מחבר/מו"ל · לפי ספר · תשלומים ויומן.
//
// 🔴 "התאמת נמכר" אינה זיכוי: ההזמנות לא משתנות, ואף לקוח לא מקבל כסף.
// היא מתקנת רק את הספירה בדוחות (למשל טעות ברישום בדוכן).
// ⚠️ בלי גלילה לרוחב: עמודות משניות מוסתרות במובייל.
// ─────────────────────────────────────────────────────────────────────────────

export type AdjustmentLog = {
  id: string; book_id: string; delta: number; amount_agorot: number
  reason: string; created_at: string; by: string | null
}
export type PaymentLog = AuthorPayment & { created_at: string; by: string | null }

type View = 'party' | 'book' | 'log'
type Dialog =
  | { kind: 'pay'; payee: string; balance: number }
  | { kind: 'adjust'; row: SettlementRow }
  | null

const field = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none'
const th = 'px-3 py-2.5 text-right text-xs font-semibold text-slate-500'
const td = 'px-3 py-2.5 align-top'
const num = 'tabular-nums'

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
  const [view, setView] = useState<View>('party')
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)

  const rows = useMemo(() => buildBookRows(books, sales, adjustments), [books, sales, adjustments])
  const parties = useMemo(() => groupByParty(rows, payments), [rows, payments])
  const titleOf = useMemo(() => new Map(books.map(b => [b.id, b.title])), [books])

  const totals = useMemo(() => parties.reduce(
    (t, p) => ({ collected: t.collected + p.collected, net: t.net + p.net, paid: t.paid + p.paid }),
    { collected: 0, net: 0, paid: 0 },
  ), [parties])

  const q = query.trim().toLowerCase()
  const match = (...s: (string | null)[]) => !q || s.some(x => (x ?? '').toLowerCase().includes(q))
  const shownParties = useMemo(() => parties.filter(p => match(p.party)), [parties, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownRows = useMemo(
    () => rows.filter(r => match(r.title, r.sku, r.author, r.publisher)),
    [rows, q], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const pgParty = useTablePagination(shownParties)
  const pgBook = useTablePagination(shownRows)

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

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          חלק מהנתונים לא נטען. אם זו הפעם הראשונה, צריך להריץ את המיגרציה <span className="font-mono">20261014_book_fair_settlement.sql</span>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="נגבה בסך הכול" value={fmtAgorot(totals.collected)} />
        <Stat label="אחרי הפחתת 5%" value={fmtAgorot(totals.net)} />
        <Stat label="שולם למחברים" value={fmtAgorot(totals.paid)} />
        <Stat label="יתרה לתשלום" value={fmtAgorot(totals.net - totals.paid)} strong />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([['party', 'לפי מחבר/מו"ל'], ['book', 'לפי ספר'], ['log', 'תשלומים והתאמות']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
              view === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
        {view !== 'log' && (
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={view === 'party' ? 'חיפוש מחבר/מו"ל' : 'חיפוש ספר, מק"ט, מחבר או מו"ל'}
            className={`${field} md:w-72`}
          />
        )}
      </div>

      {view === 'party' && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={`${th} w-[28%]`}>מחבר/מכון/מו&quot;ל</th>
                <th className={`${th} hidden md:table-cell`}>ספרים</th>
                <th className={`${th} hidden md:table-cell`}>עותקים</th>
                <th className={th}>נגבה</th>
                <th className={th}>אחרי 5%</th>
                <th className={`${th} hidden md:table-cell`}>שולם</th>
                <th className={th}>יתרה</th>
                {canEdit && <th className={`${th} w-28`} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pgParty.rows.map(p => (
                <tr key={p.party}>
                  <td className={`${td} font-medium text-slate-800`}>{p.party}</td>
                  <td className={`${td} ${num} hidden md:table-cell`}>{p.books}</td>
                  <td className={`${td} ${num} hidden md:table-cell`}>{p.qty}</td>
                  <td className={`${td} ${num}`}>{fmtAgorot(p.collected)}</td>
                  <td className={`${td} ${num} font-medium`}>{fmtAgorot(p.net)}</td>
                  <td className={`${td} ${num} hidden md:table-cell`}>
                    {fmtAgorot(p.paid)}
                    {Object.entries(p.byMethod).map(([m, a]) => (
                      <div key={m} className="text-xs text-slate-500">{PAYMENT_METHOD_LABELS[m as PaymentMethod]}: {fmtAgorot(a)}</div>
                    ))}
                  </td>
                  <td className={`${td} ${num} font-semibold ${p.balance > 0 ? 'text-amber-700' : p.balance < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {fmtAgorot(p.balance)}
                  </td>
                  {canEdit && (
                    <td className={td}>
                      <button
                        onClick={() => setDialog({ kind: 'pay', payee: p.party, balance: p.balance })}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Wallet size={13} /> רישום תשלום
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!pgParty.rows.length && <EmptyRow cols={canEdit ? 8 : 7} />}
            </tbody>
          </table>
          <div className="px-3 pb-3">
            <Pagination page={pgParty.page} size={pgParty.size} total={pgParty.total} onPage={pgParty.setPage} onSize={pgParty.setSize} />
          </div>
        </div>
      )}

      {view === 'book' && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={`${th} hidden md:table-cell w-20`}>מק&quot;ט</th>
                <th className={`${th} w-[30%]`}>ספר</th>
                <th className={`${th} hidden md:table-cell`}>מחבר/מו&quot;ל</th>
                <th className={th}>נמכר</th>
                <th className={th}>נגבה</th>
                <th className={th}>אחרי 5%</th>
                {canEdit && <th className={`${th} w-28`} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pgBook.rows.map(r => (
                <tr key={r.bookId}>
                  <td className={`${td} hidden font-mono text-xs text-slate-500 md:table-cell`}>{r.sku}</td>
                  <td className={`${td} text-slate-800`}>{r.title}</td>
                  <td className={`${td} hidden text-slate-600 md:table-cell`}>{r.party}</td>
                  <td className={`${td} ${num}`}>
                    {r.qty}
                    {r.adjQty !== 0 && (
                      <div className="text-xs text-violet-700" title="התאמה ידנית, ההזמנות לא שונו">
                        בהזמנות {r.orderedQty} · התאמה {r.adjQty > 0 ? '+' : ''}{r.adjQty}
                      </div>
                    )}
                  </td>
                  <td className={`${td} ${num}`}>{fmtAgorot(r.collected)}</td>
                  <td className={`${td} ${num} font-medium`}>{fmtAgorot(r.net)}</td>
                  {canEdit && (
                    <td className={td}>
                      <button
                        onClick={() => setDialog({ kind: 'adjust', row: r })}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <SlidersHorizontal size={13} /> תיקון כמות
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!pgBook.rows.length && <EmptyRow cols={canEdit ? 7 : 6} />}
            </tbody>
          </table>
          <div className="px-3 pb-3">
            <Pagination page={pgBook.page} size={pgBook.size} total={pgBook.total} onPage={pgBook.setPage} onSize={pgBook.setSize} />
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
            <h2 className="mb-3 text-sm font-semibold text-slate-800">יומן תיקוני כמות ({adjustments.length})</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {adjustments.map(a => (
                <li key={a.id} className="py-2.5">
                  <div className="font-medium text-slate-800">
                    {titleOf.get(a.book_id) ?? 'ספר שנמחק'} · <span className={num}>{a.delta > 0 ? '+' : ''}{a.delta}</span> עותקים
                    <span className={`mr-1 text-xs text-slate-500 ${num}`}>({fmtAgorot(a.amount_agorot)})</span>
                  </div>
                  <div className="text-xs text-slate-500">{ilDateTime(a.created_at)}{a.by && ` · ${a.by}`}</div>
                  <div className="mt-0.5 text-xs text-slate-600">{a.reason}</div>
                </li>
              ))}
              {!adjustments.length && <li className="py-6 text-center text-slate-400">אין תיקוני כמות</li>}
            </ul>
          </section>
        </div>
      )}

      {dialog?.kind === 'pay' && (
        <PaymentDialog payee={dialog.payee} balance={dialog.balance} onClose={() => setDialog(null)} onDone={() => { setDialog(null); router.refresh() }} />
      )}
      {dialog?.kind === 'adjust' && (
        <AdjustDialog row={dialog.row} price={books.find(b => b.id === dialog.row.bookId)?.price_agorot ?? 0}
                      onClose={() => setDialog(null)} onDone={() => { setDialog(null); router.refresh() }} />
      )}
      {confirmDialog}
    </div>
  )
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${strong ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${strong ? 'text-amber-800' : 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr><td colSpan={cols} className="px-4 py-12 text-center text-sm text-slate-400">אין נתונים להצגה</td></tr>
  )
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return y && m && day ? `${day}.${m}.${y}` : d
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="סגירה"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

async function post(url: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (res.ok) return null
  return (await res.json().catch(() => ({}))).error ?? 'השמירה נכשלה'
}

function PaymentDialog({ payee, balance, onClose, onDone }: {
  payee: string; balance: number; onClose: () => void; onDone: () => void
}) {
  const [amount, setAmount] = useState(balance > 0 ? String(balance / 100) : '')
  const [method, setMethod] = useState<PaymentMethod>('transfer')
  const [paidOn, setPaidOn] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setBusy(true); setErr('')
    const e = await post('/api/admin/book-fair/settlement/payments', { payee, amount, method, paidOn, note })
    setBusy(false)
    if (e) setErr(e); else onDone()
  }

  return (
    <Modal title={`רישום תשלום ל${payee}`} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1">סכום (₪)
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className={field} />
          {balance > 0 && <span className="text-xs text-slate-500">יתרה לתשלום: {fmtAgorot(balance)}</span>}
        </label>
        <label className="flex flex-col gap-1">אמצעי תשלום
          <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className={field}>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">תאריך התשלום
          <input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1">הערה (מספר צ&apos;ק, אסמכתא)
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} className={field} />
        </label>
        {err && <div className="text-sm text-red-700">{err}</div>}
        <button onClick={save} disabled={busy}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          {busy && <Loader2 size={15} className="animate-spin" />} שמירת התשלום
        </button>
      </div>
    </Modal>
  )
}

function AdjustDialog({ row, price, onClose, onDone }: {
  row: SettlementRow; price: number; onClose: () => void; onDone: () => void
}) {
  const [target, setTarget] = useState(String(row.qty))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const n = Number(target)
  const delta = Number.isInteger(n) && n >= 0 ? n - row.qty : null

  async function save() {
    if (delta === null || delta === 0) { setErr('הזן כמות אחרת מהכמות הנוכחית'); return }
    if (!reason.trim()) { setErr('כתוב סיבה קצרה'); return }
    setBusy(true); setErr('')
    const e = await post('/api/admin/book-fair/settlement/adjustments', { bookId: row.bookId, delta, reason })
    setBusy(false)
    if (e) setErr(e); else onDone()
  }

  return (
    <Modal title={`תיקון כמות שנמכרה · ${row.title}`} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
          זה לא זיכוי. ההזמנות לא משתנות ואף לקוח לא מקבל החזר. התיקון משנה רק את הספירה בקטלוג ובדוח ההתחשבנות.
        </div>
        <div className="text-slate-600">לפי ההזמנות נמכרו <b>{row.orderedQty}</b>, ובדוח מופיע כרגע <b>{row.qty}</b>.</div>
        <label className="flex flex-col gap-1">כמה נמכרו בפועל
          <input value={target} onChange={e => setTarget(e.target.value)} inputMode="numeric" className={field} />
          {delta !== null && delta !== 0 && (
            <span className="text-xs text-slate-500">
              שינוי של {delta > 0 ? '+' : ''}{delta} עותקים · {fmtAgorot(delta * price)} בסכום שנגבה
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1">סיבה
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={300}
                 placeholder="לדוגמה: בדוכן נרשם עותק אחד פעמיים" className={field} />
        </label>
        {err && <div className="text-sm text-red-700">{err}</div>}
        <button onClick={save} disabled={busy}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          {busy && <Loader2 size={15} className="animate-spin" />} שמירת התיקון
        </button>
      </div>
    </Modal>
  )
}
