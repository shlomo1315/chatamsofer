'use client'
import { useState } from 'react'
import { X, Loader2, Package, Plus, Minus } from 'lucide-react'
import type { BookFairBook } from '@/types/bookFair'

// הוספה והורדה של מלאי.
//
// 🔴 המלאי משותף לאתר ולטלפון (stock_total). עד 10.2026 היו כאן שתי
// מכסות נפרדות וכלי להעברה ביניהן; בפועל כמעט כל המלאי הוקצה לאתר
// והמכירה הטלפונית ענתה "אזל" על ספרים שהיו במחסן. אין להחזיר את
// ההפרדה — לשונית "העברה בין ערוצים" הוסרה מכאן במכוון.

export default function StockMover({ book, onClose, onSaved }: {
  book: BookFairBook
  onClose: () => void
  onSaved: () => void
}) {
  const [delta, setDelta] = useState('1')
  const [sign, setSign] = useState<1 | -1>(1)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const current = book.stock_total ?? 0

  async function submit() {
    setError('')
    const n = Number(delta)
    if (!Number.isInteger(n) || n <= 0) return setError('יש להזין כמות תקינה')
    if (sign < 0 && n > current) return setError(`אי אפשר להוריד ${n} — יש ${current} במלאי`)

    setBusy(true)
    try {
      const res = await fetch('/api/admin/book-fair/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'adjust', book_id: book.id, channel: 'web',
          delta: sign * n,
          reason: sign > 0 ? 'restock' : 'adjust',
          note: note || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'הפעולה נכשלה'); return }
      onSaved()
    } catch {
      setError('הפעולה נכשלה — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-900">{book.title}</h2>
            <p className="font-mono text-xs text-slate-400">{book.sku}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {book.unlimited_stock ? (
            <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-800">
              הספר מסומן כבלתי מוגבל — הוא תמיד זמין למכירה, ואין לו מלאי לנהל.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
                <Package size={20} className="text-slate-400" />
                <div>
                  <div className="text-2xl font-bold tabular-nums text-slate-900">{current}</div>
                  <div className="text-xs text-slate-500">עותקים במלאי · משותף לאתר ולטלפון</div>
                </div>
              </div>

              <div className="flex gap-2">
                <ChoiceButton active={sign === 1}  onClick={() => setSign(1)}  icon={Plus}>הוספה</ChoiceButton>
                <ChoiceButton active={sign === -1} onClick={() => setSign(-1)} icon={Minus}>הורדה</ChoiceButton>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">כמות</span>
                <input
                  value={delta}
                  onChange={e => setDelta(e.target.value.replace(/\D/g, ''))}
                  dir="ltr" inputMode="numeric"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
                <span className="text-xs text-slate-400">
                  אחרי השינוי: {Math.max(0, current + sign * (Number(delta) || 0))}
                </span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">הערה</span>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="למשל: קבלת משלוח מההוצאה"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
                <span className="text-xs text-slate-400">נרשמת ביומן התנועות</span>
              </label>
            </div>
          )}

          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">ביטול</button>
          <button
            onClick={submit}
            disabled={busy || book.unlimited_stock}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            אישור
          </button>
        </div>
      </div>
    </div>
  )
}

function ChoiceButton({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon: React.ElementType; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
        active ? 'border-indigo-300 bg-indigo-50 font-medium text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon size={15} /> {children}
    </button>
  )
}
