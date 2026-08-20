'use client'
import { useState, useMemo } from 'react'
import { Loader2, Receipt, RefreshCw, Search, AlertTriangle, Check, X, RotateCcw } from 'lucide-react'
import Pagination from '@/components/ui/Pagination'
import { useTablePagination } from '@/lib/useTablePagination'

// ─────────────────────────────────────────────────────────────────────────────
// היסטוריית עסקאות + איפוס הכרטיסים.
//
// 🔴 העסקאות נקראות מהמטמון במסד — מיידי. הסנכרון מנדרים הוא הפעולה
// האיטית (קריאה לכל משפחה), ולכן הוא ידני ולא רץ בפתיחת המסך.
//
// 🔴 האיפוס בלתי הפיך, ולכן תמיד בשני שלבים עם התרעה על היתרה.
// ─────────────────────────────────────────────────────────────────────────────

interface Tx { id: string; familyName: string; date: string | null; store: string; amount: number }
interface ResetPreview { cards: number; remaining: number; noClient: number; loaded: number }

const fmt = (n: number) => new Intl.NumberFormat('he-IL').format(n)
const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('he-IL')
}

export default function TransactionsPanel({ distributionId }: { distributionId: string }) {
  const [tx, setTx] = useState<Tx[] | null>(null)
  const [sum, setSum] = useState(0)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  const [reset, setReset] = useState<ResetPreview | null>(null)

  async function loadTx() {
    setBusy('load'); setErr('')
    try {
      const res = await fetch(`/api/admin/holiday-transactions?distribution_id=${encodeURIComponent(distributionId)}`,
        { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'הטעינה נכשלה'); return }
      setTx(d.transactions ?? []); setSum(d.sum ?? 0)
    } catch { setErr('שגיאת רשת') } finally { setBusy('') }
  }

  async function sync() {
    setBusy('sync'); setErr(''); setDone('')
    try {
      const res = await fetch('/api/admin/holiday-transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distribution_id: distributionId }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'הסנכרון נכשל'); return }
      setDone(`סונכרנו ${fmt(d.synced ?? 0)} כרטיסים · ${fmt(d.transactions ?? 0)} עסקאות`)
      await loadTx()
    } catch { setErr('שגיאת רשת') } finally { setBusy('') }
  }

  async function checkReset() {
    setBusy('reset-check'); setErr(''); setDone('')
    try {
      const res = await fetch(`/api/admin/holiday-reset?distribution_id=${encodeURIComponent(distributionId)}`,
        { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'הבדיקה נכשלה'); return }
      setReset(d)
    } catch { setErr('שגיאת רשת') } finally { setBusy('') }
  }

  async function runReset() {
    if (!reset) return
    // ⚠️ הסכום נאמר שוב באישור האחרון, במילים מפורשות.
    if (!confirm(
      `לפרוק ${fmt(reset.remaining)} ₪ ולנתק ${fmt(reset.cards)} כרטיסים?\n\n` +
      `הפעולה אינה הפיכה. הלקוחות יישארו בנדרים עם ההיסטוריה.`
    )) return

    setBusy('reset'); setErr(''); setDone('')
    try {
      const res = await fetch('/api/admin/holiday-reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distribution_id: distributionId, confirm: true }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'האיפוס נכשל'); return }
      setDone(`${fmt(d.unloaded ?? 0)} תלושים נפרקו · ${fmt(d.detached ?? 0)} כרטיסים נותקו`)
      setReset(null)
    } catch { setErr('שגיאת רשת') } finally { setBusy('') }
  }

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q || !tx) return tx ?? []
    return tx.filter(t => `${t.familyName} ${t.store}`.includes(q))
  }, [tx, query])
  const pg = useTablePagination(filtered)

  return (
    <div className="flex flex-col gap-4">
      {/* ── עסקאות ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
          <Receipt size={15} className="text-indigo-600" /> היסטוריית עסקאות
        </h3>
        <p className="mb-3 text-[11px] text-slate-500">
          קניות בבתי עסק בלבד — טעינות ופריקות אינן עסקאות.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={loadTx} disabled={!!busy}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            {busy === 'load' ? <Loader2 size={13} className="inline animate-spin" /> : null} הצג עסקאות
          </button>
          <button type="button" onClick={sync} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-white px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-50 disabled:opacity-40">
            {busy === 'sync' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            סנכרון מנדרים
          </button>
          {tx && <span className="text-xs text-slate-500">{fmt(tx.length)} עסקאות · {fmt(sum)} ₪</span>}
        </div>

        {tx && tx.length > 0 && (
          <>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <Search size={14} className="flex-shrink-0 text-slate-400" />
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="חיפוש לפי משפחה או חנות…"
                className="w-full bg-transparent text-sm placeholder:text-slate-400 focus:outline-none" />
            </div>

            <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-right text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">משפחה</th>
                    <th className="px-3 py-2 font-semibold">חנות</th>
                    <th className="px-3 py-2 font-semibold">תאריך</th>
                    <th className="px-3 py-2 font-semibold">סכום</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pg.rows.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-800">{t.familyName}</td>
                      <td className="px-3 py-2 text-slate-600">{t.store}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{fmtDate(t.date)}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-700">{fmt(t.amount)} ₪</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pg.page} size={pg.size} total={pg.total} onPage={pg.setPage} onSize={pg.setSize} />
          </>
        )}

        {tx && !tx.length && (
          <p className="py-6 text-center text-sm text-slate-400">
            אין עסקאות. יש לסנכרן מנדרים תחילה.
          </p>
        )}
      </div>

      {/* ── איפוס ── */}
      <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/40 p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-extrabold text-rose-900">
          <RotateCcw size={15} /> איפוס מלא
        </h3>
        <p className="mb-3 text-[11px] text-slate-600">
          פורק את היתרה ומנתק את הכרטיסים.
          <strong className="text-slate-800"> הלקוחות נשארים בנדרים עם ההיסטוריה</strong> —
          בחג הבא מחברים כרטיס חדש בלי להקליד הכול מחדש.
        </p>

        <button type="button" onClick={checkReset} disabled={!!busy}
          className="rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-40">
          {busy === 'reset-check' ? <Loader2 size={13} className="inline animate-spin" /> : null}
          בדיקה לפני איפוס
        </button>

        {reset && (
          <div className="mt-3 rounded-xl border border-rose-300 bg-white p-3.5">
            <p className="flex items-center gap-1.5 text-sm font-bold text-rose-900">
              <AlertTriangle size={15} /> פעולה בלתי הפיכה
            </p>
            {/* 🔴 ההתרעה שביקשת — כמה כסף עדיין טעון. */}
            <p className="my-2 text-2xl font-extrabold text-rose-900">{fmt(reset.remaining)} ₪</p>
            <ul className="mb-3 flex flex-col gap-0.5 text-[11px] text-slate-600">
              <li>· עדיין טעונים בכרטיסים ויירדו</li>
              <li>· {fmt(reset.cards)} כרטיסים ינותקו</li>
              {reset.noClient > 0 && <li className="text-amber-700">· {fmt(reset.noClient)} לא נמצאו בנדרים</li>}
            </ul>
            {reset.cards > 0 ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={runReset} disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-rose-700 disabled:opacity-40">
                  {busy === 'reset' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  כן, אפס הכול
                </button>
                <button type="button" onClick={() => setReset(null)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700">ביטול</button>
              </div>
            ) : (
              <p className="text-xs font-semibold text-slate-500">אין כרטיסים לאיפוס</p>
            )}
          </div>
        )}
      </div>

      {done && (
        <p className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          <Check size={15} /> {done}
        </p>
      )}
      {err && (
        <p className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <X size={15} /> {err}
        </p>
      )}
    </div>
  )
}
