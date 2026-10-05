'use client'
import { useState, useRef } from 'react'
import { Search, Loader2, Check, AlertTriangle, PackageCheck, X, Globe, Phone } from 'lucide-react'
import { fmtAgorot } from '@/lib/bookFairPricing'

// ─────────────────────────────────────────────────────────────────────────────
// איסוף עצמי בדוכן: הלקוח מגיע, המוכר מחפש לפי מספר הזמנה או טלפון,
// רואה מה הוזמן ושולם, ולוחץ "נמסר".
//
// 🔴 "כבר נמסר" מוצג בבולט ועם שם המוסר — כדי שהזמנה לא תימסר פעמיים.
// ─────────────────────────────────────────────────────────────────────────────

type State = 'ready' | 'delivered' | 'unpaid' | 'shipping' | 'cancelled'

type PickupOrder = {
  id: string
  orderNumber: string
  channel: string
  state: State
  customerName: string | null
  phoneHint: string | null
  totalAgorot: number
  refundedAgorot: number
  createdAt: string
  pickedUpAt: string | null
  pickedUpBy: string | null
  items: { title: string; quantity: number; lineTotalAgorot: number }[]
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const BLOCKED: Record<Exclude<State, 'ready' | 'delivered'>, string> = {
  unpaid: 'ההזמנה טרם שולמה — אין למסור',
  shipping: 'הזמנה זו נשלחת בדואר — אינה לאיסוף',
  cancelled: 'ההזמנה בוטלה — אין למסור',
}

export default function PickupPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [orders, setOrders] = useState<PickupOrder[] | null>(null)
  const [delivering, setDelivering] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function search() {
    const term = q.trim()
    if (!term) return
    setError(''); setBusy(true); setConfirmId(null)
    try {
      const res = await fetch(`/api/yerid/seller/pickup?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
      if (res.status === 401) { onUnauthorized(); return }
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'החיפוש נכשל'); setOrders(null); return }
      setOrders(d.orders ?? [])
    } catch {
      setError('החיפוש נכשל — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  async function deliver(id: string) {
    setError(''); setDelivering(id)
    try {
      const res = await fetch('/api/yerid/seller/pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: id }),
      })
      if (res.status === 401) { onUnauthorized(); return }
      const d = await res.json()
      // ⚠️ גם בכישלון (409) השרת מחזיר את מצב ההזמנה העדכני — מציגים
      // אותו, כדי שהמוכר יראה "כבר נמסר ע״י X" ולא רק הודעת שגיאה.
      if (d.order) setOrders(os => (os ?? []).map(o => o.id === id ? d.order : o))
      if (!res.ok) setError(d.error ?? 'הסימון נכשל')
    } catch {
      setError('הסימון נכשל — בדקו את החיבור')
    } finally {
      setDelivering(null); setConfirmId(null)
    }
  }

  function clear() {
    setQ(''); setOrders(null); setError(''); setConfirmId(null)
    inputRef.current?.focus()
  }

  return (
    <div>
      <form
        onSubmit={e => { e.preventDefault(); void search() }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search size={19} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#141210]/30" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="מספר הזמנה או טלפון"
            inputMode="text"
            autoFocus
            aria-label="מספר הזמנה או טלפון"
            className="w-full rounded-xl border-2 border-[#141210]/10 bg-white py-4 pr-12 pl-10 text-lg outline-none transition placeholder:text-[#141210]/30 focus:border-[#B8860B]"
          />
          {q && (
            <button type="button" onClick={clear} aria-label="ניקוי"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[#141210]/35 hover:text-[#141210]">
              <X size={18} />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="flex min-w-[96px] items-center justify-center gap-2 rounded-xl bg-[#12314F] px-5 text-lg font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : 'חיפוש'}
        </button>
      </form>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border-2 border-[#6B2737]/30 bg-[#6B2737]/5 px-4 py-3 text-base text-[#6B2737]">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" /> {error}
        </p>
      )}

      {orders && !orders.length && (
        <p className="mt-4 rounded-xl bg-white px-4 py-6 text-center text-lg text-[#141210]/55">
          לא נמצאה הזמנה לאיסוף
        </p>
      )}

      {!orders && !error && (
        <div className="mt-8 flex flex-col items-center gap-3 py-10 text-center">
          <PackageCheck size={40} className="text-[#141210]/15" />
          <p className="text-lg text-[#141210]/45">הזינו מספר הזמנה או טלפון של הלקוח</p>
          <p className="text-sm text-[#141210]/35">רק הזמנות לאיסוף עצמי מהאתר ומהטלפון</p>
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-3">
        {(orders ?? []).map(o => (
          <li key={o.id} className={`rounded-2xl border-2 bg-white p-4 ${
            o.state === 'ready' ? 'border-[#2D5016]/30'
            : o.state === 'delivered' ? 'border-[#B8860B]/50'
            : 'border-[#6B2737]/30'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-2xl font-bold tabular-nums text-[#12314F]">הזמנה {o.orderNumber}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[#141210]/55">
                  {o.channel === 'phone' ? <Phone size={14} /> : <Globe size={14} />}
                  {o.channel === 'phone' ? 'הזמנה טלפונית' : 'הזמנה באתר'} · {fmtTime(o.createdAt)}
                </p>
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold tabular-nums text-[#6B2737]">{fmtAgorot(o.totalAgorot)}</p>
                {(o.state === 'ready' || o.state === 'delivered') && (
                  <p className="flex items-center justify-end gap-1 text-sm font-bold text-[#2D5016]">
                    <Check size={15} strokeWidth={3} /> שולם
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 rounded-xl bg-[#FAF7F0] px-4 py-3">
              <p className="text-lg font-semibold text-[#141210]">{o.customerName || 'ללא שם'}</p>
              {o.phoneHint && <p className="text-sm tabular-nums text-[#141210]/55" dir="ltr">{o.phoneHint}</p>}
            </div>

            <ul className="mt-3 flex flex-col gap-1.5">
              {o.items.map((it, i) => (
                <li key={i} className="flex items-start justify-between gap-3 text-base">
                  <span className="min-w-0 flex-1 text-[#12314F]">{it.title}</span>
                  <span className="flex-shrink-0 rounded-md bg-[#12314F]/8 px-2 font-bold tabular-nums text-[#12314F]">
                    ×{it.quantity}
                  </span>
                </li>
              ))}
            </ul>

            {o.refundedAgorot > 0 && o.state === 'ready' && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                בוצע זיכוי חלקי של {fmtAgorot(o.refundedAgorot)} — ודאו מול המשרד אילו ספרים נשארו בהזמנה.
              </p>
            )}

            {o.state === 'ready' && (
              confirmId === o.id ? (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => deliver(o.id)}
                    disabled={delivering === o.id}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2D5016] py-4 text-lg font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    {delivering === o.id ? <Loader2 size={19} className="animate-spin" /> : <Check size={20} strokeWidth={3} />}
                    כן, הספרים נמסרו
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="rounded-xl border-2 border-[#141210]/15 px-5 text-base font-semibold text-[#141210]/70"
                  >
                    ביטול
                  </button>
                </div>
              ) : (
                // ⚠️ אישור בשני שלבים: לחיצה אחת בטעות על ההזמנה הלא
                // נכונה הייתה מסמנת אותה כנמסרה — ואת זה רק מנהל מבטל.
                <button
                  onClick={() => setConfirmId(o.id)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2D5016] py-4 text-xl font-bold text-white transition hover:brightness-110"
                >
                  <PackageCheck size={22} /> נמסר
                </button>
              )
            )}

            {o.state === 'delivered' && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#B8860B]/12 px-4 py-3.5 text-lg font-bold text-[#7A5A07]">
                <AlertTriangle size={20} className="flex-shrink-0" />
                <span>
                  כבר נמסר
                  {o.pickedUpAt && <> · {fmtTime(o.pickedUpAt)}</>}
                  {o.pickedUpBy && <> · ע״י {o.pickedUpBy}</>}
                </span>
              </p>
            )}

            {(o.state === 'unpaid' || o.state === 'shipping' || o.state === 'cancelled') && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#6B2737]/8 px-4 py-3.5 text-lg font-bold text-[#6B2737]">
                <X size={20} className="flex-shrink-0" /> {BLOCKED[o.state]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
