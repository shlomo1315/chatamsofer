'use client'
import { useState } from 'react'
import { X, Loader2, ArrowLeft, Globe, Phone, Plus, Minus } from 'lucide-react'
import type { BookFairBook } from '@/types/bookFair'

// העברת מלאי בין הערוצים + תיקון ידני.
//
// 🔴 זו הדרך היחידה שבה מלאי חוצה את ההפרדה בין האתר לטלפון. ההפרדה
// קשיחה במכוון — נגמר באחד, השני ממשיך — ולכן ההעברה היא החלטה אנושית
// מפורשת ולא גלישה אוטומטית.

type Mode = 'move' | 'adjust'

export default function StockMover({ book, onClose, onSaved }: {
  book: BookFairBook
  onClose: () => void
  onSaved: () => void
}) {
  const [mode, setMode] = useState<Mode>('move')
  const [from, setFrom] = useState<'web' | 'phone'>('web')
  const [qty, setQty] = useState('1')
  const [adjChannel, setAdjChannel] = useState<'web' | 'phone'>('web')
  const [adjDelta, setAdjDelta] = useState('1')
  const [adjSign, setAdjSign] = useState<1 | -1>(1)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const to = from === 'web' ? 'phone' : 'web'
  const available = from === 'web' ? book.stock_web : book.stock_phone

  async function submit() {
    setError('')
    setBusy(true)
    try {
      const body = mode === 'move'
        ? { op: 'move', book_id: book.id, from, to, quantity: Number(qty) }
        : {
            op: 'adjust', book_id: book.id, channel: adjChannel,
            delta: adjSign * Number(adjDelta),
            reason: adjSign > 0 ? 'restock' : 'adjust',
            note: note || null,
          }

      const res = await fetch('/api/admin/book-fair/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

        {/* המצב הנוכחי — שני הערוצים זה לצד זה */}
        <div className="grid grid-cols-2 gap-3 p-5 pb-0">
          <ChannelCard icon={Globe} label="אתר" value={book.stock_web} active={mode === 'move' ? from === 'web' : adjChannel === 'web'} />
          <ChannelCard icon={Phone} label="טלפון" value={book.stock_phone} active={mode === 'move' ? from === 'phone' : adjChannel === 'phone'} />
        </div>

        <div className="flex gap-1 px-5 pt-4">
          <ModeTab active={mode === 'move'}   onClick={() => setMode('move')}>העברה בין ערוצים</ModeTab>
          <ModeTab active={mode === 'adjust'} onClick={() => setMode('adjust')}>הוספה / הורדה</ModeTab>
        </div>

        <div className="p-5">
          {mode === 'move' ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-center gap-3 rounded-xl bg-slate-50 p-4">
                <ChannelPill label={from === 'web' ? 'אתר' : 'טלפון'} />
                <ArrowLeft size={18} className="text-slate-400" />
                <ChannelPill label={to === 'web' ? 'אתר' : 'טלפון'} />
                <button
                  onClick={() => setFrom(f => f === 'web' ? 'phone' : 'web')}
                  className="mr-2 rounded-lg px-2.5 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
                >
                  החלף כיוון
                </button>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">כמות להעברה</span>
                <input
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  dir="ltr" inputMode="numeric"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
                <span className="text-xs text-slate-400">זמין להעברה: {available}</span>
              </label>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <ChoiceButton active={adjChannel === 'web'}   onClick={() => setAdjChannel('web')}   icon={Globe}>אתר</ChoiceButton>
                <ChoiceButton active={adjChannel === 'phone'} onClick={() => setAdjChannel('phone')} icon={Phone}>טלפון</ChoiceButton>
              </div>

              <div className="flex gap-2">
                <ChoiceButton active={adjSign === 1}  onClick={() => setAdjSign(1)}  icon={Plus}>הוספה</ChoiceButton>
                <ChoiceButton active={adjSign === -1} onClick={() => setAdjSign(-1)} icon={Minus}>הורדה</ChoiceButton>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">כמות</span>
                <input
                  value={adjDelta}
                  onChange={e => setAdjDelta(e.target.value)}
                  dir="ltr" inputMode="numeric"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
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
            disabled={busy}
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

function ChannelCard({ icon: Icon, label, value, active }: {
  icon: React.ElementType; label: string; value: number; active: boolean
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 transition ${
      active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'
    }`}>
      <Icon size={18} className={active ? 'text-indigo-600' : 'text-slate-400'} />
      <div>
        <div className="text-lg font-bold tabular-nums text-slate-900">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  )
}

function ChannelPill({ label }: { label: string }) {
  return <span className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 border border-slate-200">{label}</span>
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm transition ${
        active ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
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
