'use client'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { Search, ShoppingCart, Plus, Minus, X, BookOpen, Check } from 'lucide-react'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { shippingCost } from '@/lib/bookFairShipping'
import type { PublicBook, PublicCity, PublicTier } from './page'

// חנות יריד הספרים.
//
// קהל היעד כולל קונים מבוגרים ומכשירים ישנים. לכן: טיפוגרפיה גדולה,
// אזורי לחיצה רחבים, בלי אנימציות כניסה, והמק"ט בולט — הוא דרך החיפוש
// העיקרית כאן, בשונה מחנות רגילה שבה הוא מספר אפור זעיר.

type CartLine = { book: PublicBook; quantity: number }

const CART_KEY = 'book_fair_cart_v1'

export default function YeridStore({ books, cities, tiers, open }: {
  books: PublicBook[]; cities: PublicCity[]; tiers: PublicTier[]; open: boolean
}) {
  const [query, setQuery] = useState('')

  // ⚠️ העגלה נשמרת מקומית: לקוח שסגר בטעות את הכרטיסייה חוזר למה שבנה.
  //
  // ⚠️ אתחול עצל (פונקציה ל-useState) ולא טעינה ב-useEffect: טעינה
  // באפקט הייתה מרנדרת פעם אחת עם עגלה ריקה ואז שוב עם המלאה —
  // הקונה היה רואה את העגלה שלו "נעלמת" לרגע.
  //
  // ⚠️ עטוף ב-try: דפדפן בגלישה פרטית זורק כאן, ונפילה הייתה מפילה את
  // כל החנות במקום לוותר על נוחות אחת.
  const [cart, setCart] = useState<Map<string, number>>(() => {
    if (typeof window === 'undefined') return new Map()
    try {
      const saved = localStorage.getItem(CART_KEY)
      if (!saved) return new Map()
      const parsed = JSON.parse(saved) as [string, number][]
      return new Map(parsed.filter(([id, q]) => typeof q === 'number' && q > 0 && typeof id === 'string'))
    } catch { return new Map() }
  })
  const [cartOpen, setCartOpen] = useState(false)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify([...cart])) } catch { /* לא קריטי */ }
  }, [cart])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return books
    // ⚠️ התאמת מק"ט מדויקת קופצת לראש: מי שהקליד מק"ט יודע מה הוא רוצה.
    const exact = books.filter(b => b.sku.toLowerCase() === q)
    const rest = books.filter(b =>
      b.sku.toLowerCase() !== q && (
        b.sku.toLowerCase().includes(q) ||
        b.title.toLowerCase().includes(q) ||
        (b.author ?? '').toLowerCase().includes(q) ||
        (b.publisher ?? '').toLowerCase().includes(q)
      )
    )
    return [...exact, ...rest]
  }, [books, query])

  const lines: CartLine[] = useMemo(() => {
    const out: CartLine[] = []
    for (const [id, qty] of cart) {
      const book = books.find(b => b.id === id)
      if (book) out.push({ book, quantity: qty })
    }
    return out
  }, [cart, books])

  const bookCount = lines.reduce((s, l) => s + l.quantity, 0)
  const itemsTotal = lines.reduce((s, l) => s + l.book.price_agorot * l.quantity, 0)

  const add = useCallback((b: PublicBook) => {
    setCart(c => new Map(c).set(b.id, (c.get(b.id) ?? 0) + 1))
    setJustAdded(b.id)
    setTimeout(() => setJustAdded(v => v === b.id ? null : v), 1200)
  }, [])

  const setQty = useCallback((id: string, qty: number) => {
    setCart(c => {
      const next = new Map(c)
      if (qty <= 0) next.delete(id)
      else next.set(id, Math.min(99, qty))
      return next
    })
  }, [])

  if (!open) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
        <BookOpen size={44} className="text-[#1E3A5F]" strokeWidth={1.5} />
        <h1 className="text-3xl font-bold text-stone-900">יריד הספרים סגור כעת</h1>
        <p className="text-lg text-stone-600">ההזמנות ייפתחו בקרוב. נשמח לראותכם.</p>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-[#FBF9F5] pb-32 lg:pb-8">
      {/* ── כותרת ── */}
      <header className="border-b-2 border-[#1E3A5F] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <BookOpen size={28} className="text-[#1E3A5F]" strokeWidth={1.5} />
            <div>
              <h1 className="text-2xl font-bold leading-tight text-stone-900">יריד הספרים</h1>
              <p className="text-sm text-stone-500">היכל החתם סופר</p>
            </div>
          </div>

          {/* ⚠️ העגלה גלויה תמיד ולא מוסתרת מאחורי אייקון — הקונה צריך
              לדעת בכל רגע כמה יש בה וכמה זה עולה. */}
          <button
            onClick={() => setCartOpen(true)}
            className="hidden items-center gap-3 rounded-xl border-2 border-[#1E3A5F] bg-white px-5 py-3 text-base font-semibold text-[#1E3A5F] transition hover:bg-[#1E3A5F] hover:text-white lg:flex"
          >
            <ShoppingCart size={20} />
            {bookCount > 0 ? (
              <span>{bookCount} ספרים · {fmtAgorot(itemsTotal)}</span>
            ) : (
              <span>העגלה ריקה</span>
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6">
        {/* ── חיפוש ── */}
        <div className="mb-6">
          <label className="mb-2 block text-lg font-semibold text-stone-800">
            חיפוש ספר
          </label>
          <div className="relative">
            <Search size={22} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="הקלידו מק״ט או שם ספר"
              inputMode="search"
              className="w-full rounded-xl border-2 border-stone-300 bg-white py-4 pr-14 pl-4 text-lg outline-none transition focus:border-[#1E3A5F]"
            />
          </div>
          {query && (
            <p className="mt-2 text-base text-stone-600">
              {filtered.length ? `נמצאו ${filtered.length} ספרים` : 'לא נמצאו ספרים'}
            </p>
          )}
        </div>

        {/* ── הקטלוג ── */}
        {!books.length ? (
          <p className="py-20 text-center text-lg text-stone-500">הקטלוג יעלה בקרוב.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(b => (
              <BookCard
                key={b.id}
                book={b}
                inCart={cart.get(b.id) ?? 0}
                justAdded={justAdded === b.id}
                onAdd={() => add(b)}
                onSetQty={q => setQty(b.id, q)}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── סרגל תחתון בנייד ── */}
      {bookCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-[#1E3A5F] bg-white p-4 lg:hidden">
          <button
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between rounded-xl bg-[#1E3A5F] px-5 py-4 text-lg font-semibold text-white"
          >
            <span className="flex items-center gap-2"><ShoppingCart size={20} /> {bookCount} ספרים</span>
            <span>{fmtAgorot(itemsTotal)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <CartPanel
          lines={lines}
          cities={cities}
          tiers={tiers}
          onClose={() => setCartOpen(false)}
          onSetQty={setQty}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function BookCard({ book, inCart, justAdded, onAdd, onSetQty }: {
  book: PublicBook; inCart: number; justAdded: boolean
  onAdd: () => void; onSetQty: (q: number) => void
}) {
  const out = !book.in_stock

  return (
    <article className={`flex flex-col rounded-xl border-2 bg-white p-5 ${
      out ? 'border-stone-200 opacity-60' : 'border-stone-200'
    }`}>
      {/* ⚠️ המק"ט ראשון ובולט — זו דרך החיפוש של הלקוח כאן */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="rounded-md bg-stone-100 px-2.5 py-1 font-mono text-sm font-semibold text-stone-700">
          {book.sku}
        </span>
        {book.volumes > 1 && (
          <span className="text-sm text-stone-500">{book.volumes} כרכים</span>
        )}
      </div>

      <h2 className="mb-1 text-[19px] font-bold leading-snug text-stone-900">{book.title}</h2>

      {(book.author || book.publisher) && (
        <p className="mb-3 text-base text-stone-600">
          {[book.author, book.publisher].filter(Boolean).join(' · ')}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-3">
        <span className="text-2xl font-bold text-[#1E3A5F]">{fmtAgorot(book.price_agorot)}</span>

        {out ? (
          <span className="rounded-lg bg-stone-100 px-4 py-2.5 text-base font-medium text-stone-500">
            אזל המלאי
          </span>
        ) : inCart > 0 ? (
          <div className="flex items-center gap-1 rounded-xl border-2 border-[#1E3A5F]">
            <button
              onClick={() => onSetQty(inCart - 1)}
              aria-label="הפחתת כמות"
              className="flex h-12 w-12 items-center justify-center text-[#1E3A5F] transition hover:bg-stone-50"
            >
              <Minus size={20} />
            </button>
            <span className="min-w-[2.5rem] text-center text-xl font-bold tabular-nums text-stone-900">{inCart}</span>
            <button
              onClick={() => onSetQty(inCart + 1)}
              aria-label="הוספת כמות"
              className="flex h-12 w-12 items-center justify-center text-[#1E3A5F] transition hover:bg-stone-50"
            >
              <Plus size={20} />
            </button>
          </div>
        ) : (
          <button
            onClick={onAdd}
            className={`flex min-h-[48px] items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold text-white transition ${
              justAdded ? 'bg-emerald-600' : 'bg-[#1E3A5F] hover:bg-[#16304f]'
            }`}
          >
            {justAdded ? <><Check size={18} /> נוסף</> : 'הוספה'}
          </button>
        )}
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function CartPanel({ lines, cities, tiers, onClose, onSetQty }: {
  lines: CartLine[]; cities: PublicCity[]; tiers: PublicTier[]
  onClose: () => void; onSetQty: (id: string, q: number) => void
}) {
  const [step, setStep] = useState<'cart' | 'details'>('cart')
  const [method, setMethod] = useState<'pickup' | 'shipping'>('pickup')
  const [cityId, setCityId] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const bookCount = lines.reduce((s, l) => s + l.quantity, 0)
  const itemsTotal = lines.reduce((s, l) => s + l.book.price_agorot * l.quantity, 0)
  const ship = shippingCost(method, bookCount, tiers)
  const total = itemsTotal + (ship ?? 0)

  async function submit() {
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/yerid/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lines.map(l => ({ book_id: l.book.id, quantity: l.quantity })),
          delivery_method: method,
          city_id: method === 'shipping' ? cityId : null,
          address_text: method === 'shipping' ? form.address : null,
          customer_name: form.name,
          customer_phone: form.phone,
          customer_email: form.email,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'ההזמנה נכשלה'); return }

      // ⚠️ מנקים את העגלה רק אחרי שההזמנה נוצרה בהצלחה
      try { localStorage.removeItem(CART_KEY) } catch { /* לא קריטי */ }
      window.location.href = json.redirectUrl
    } catch {
      setError('ההזמנה נכשלה. בדקו את החיבור ונסו שוב.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-start bg-stone-900/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-stone-200 px-5 py-4">
          <h2 className="text-xl font-bold text-stone-900">
            {step === 'cart' ? 'העגלה שלי' : 'פרטים למשלוח'}
          </h2>
          <button onClick={onClose} aria-label="סגירה" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'cart' ? (
            !lines.length ? (
              <p className="py-16 text-center text-lg text-stone-500">העגלה ריקה</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {lines.map(l => (
                  <li key={l.book.id} className="flex items-start gap-3 rounded-xl border-2 border-stone-200 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm text-stone-500">{l.book.sku}</p>
                      <p className="text-[17px] font-semibold leading-snug text-stone-900">{l.book.title}</p>
                      <p className="mt-1 text-base text-stone-600">{fmtAgorot(l.book.price_agorot)} ליחידה</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1 rounded-lg border-2 border-stone-300">
                        <button onClick={() => onSetQty(l.book.id, l.quantity - 1)} aria-label="הפחתה"
                          className="flex h-10 w-10 items-center justify-center text-stone-600">
                          <Minus size={16} />
                        </button>
                        <span className="min-w-[2rem] text-center text-lg font-bold tabular-nums">{l.quantity}</span>
                        <button onClick={() => onSetQty(l.book.id, l.quantity + 1)} aria-label="הוספה"
                          className="flex h-10 w-10 items-center justify-center text-stone-600">
                          <Plus size={16} />
                        </button>
                      </div>
                      <span className="text-lg font-bold text-[#1E3A5F]">
                        {fmtAgorot(l.book.price_agorot * l.quantity)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="flex flex-col gap-5">
              {/* ── אופן האיסוף ── */}
              <fieldset>
                <legend className="mb-2 text-lg font-semibold text-stone-800">איך לקבל את הספרים?</legend>
                <div className="flex flex-col gap-2">
                  <MethodOption
                    active={method === 'pickup'} onClick={() => setMethod('pickup')}
                    title="איסוף עצמי מהיריד" note="ללא עלות"
                  />
                  <MethodOption
                    active={method === 'shipping'} onClick={() => setMethod('shipping')}
                    title="משלוח עד הבית"
                    note={ship === null && method === 'shipping' ? 'לא הוגדר תעריף' : undefined}
                  />
                </div>
              </fieldset>

              {method === 'shipping' && (
                <>
                  <Field label="עיר" required>
                    <select
                      value={cityId} onChange={e => setCityId(e.target.value)}
                      className="w-full rounded-xl border-2 border-stone-300 bg-white px-4 py-3.5 text-lg outline-none focus:border-[#1E3A5F]"
                    >
                      <option value="">בחרו עיר</option>
                      {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {/* ⚠️ אמירה מפורשת ולא רשימה שקטה: לקוח שאינו מוצא את
                        עירו צריך להבין מיד שאיננו משלחים אליה. */}
                    <span className="mt-1 block text-sm text-stone-500">
                      משלוחים לערים המופיעות ברשימה בלבד
                    </span>
                  </Field>

                  <Field label="כתובת מלאה" required>
                    <input
                      value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                      placeholder="רחוב, מספר בית ודירה"
                      className="w-full rounded-xl border-2 border-stone-300 px-4 py-3.5 text-lg outline-none focus:border-[#1E3A5F]"
                    />
                  </Field>
                </>
              )}

              <Field label="שם מלא" required>
                <input
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border-2 border-stone-300 px-4 py-3.5 text-lg outline-none focus:border-[#1E3A5F]"
                />
              </Field>

              <Field label="טלפון" required>
                <input
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  inputMode="tel" dir="ltr"
                  className="w-full rounded-xl border-2 border-stone-300 px-4 py-3.5 text-lg outline-none focus:border-[#1E3A5F]"
                />
              </Field>

              <Field label="אימייל" hint="לקבלת אישור ההזמנה וקישור למעקב">
                <input
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  inputMode="email" dir="ltr"
                  className="w-full rounded-xl border-2 border-stone-300 px-4 py-3.5 text-lg outline-none focus:border-[#1E3A5F]"
                />
              </Field>

              {error && (
                <p className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-base text-red-800">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* ── סיכום וכפתור ── */}
        {lines.length > 0 && (
          <div className="border-t-2 border-stone-200 bg-stone-50 px-5 py-4">
            <dl className="mb-3 flex flex-col gap-1.5 text-base">
              <div className="flex justify-between text-stone-700">
                <dt>{bookCount} ספרים</dt>
                <dd className="tabular-nums">{fmtAgorot(itemsTotal)}</dd>
              </div>
              {step === 'details' && (
                <div className="flex justify-between text-stone-700">
                  <dt>{method === 'pickup' ? 'איסוף עצמי' : 'משלוח'}</dt>
                  <dd className="tabular-nums">
                    {ship === null ? '—' : ship === 0 ? 'ללא עלות' : fmtAgorot(ship)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-t-2 border-stone-200 pt-2 text-xl font-bold text-stone-900">
                <dt>סך הכול</dt>
                <dd className="tabular-nums">{fmtAgorot(step === 'details' ? total : itemsTotal)}</dd>
              </div>
            </dl>

            {step === 'cart' ? (
              <button
                onClick={() => setStep('details')}
                className="w-full rounded-xl bg-[#1E3A5F] py-4 text-lg font-semibold text-white transition hover:bg-[#16304f]"
              >
                המשך להזמנה
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setStep('cart')}
                  className="rounded-xl border-2 border-stone-300 px-5 py-4 text-lg font-medium text-stone-700"
                >
                  חזרה
                </button>
                <button
                  onClick={submit}
                  disabled={busy || ship === null}
                  className="flex-1 rounded-xl bg-[#1E3A5F] py-4 text-lg font-semibold text-white transition hover:bg-[#16304f] disabled:opacity-50"
                >
                  {busy ? 'מעביר לתשלום…' : `לתשלום ${fmtAgorot(total)}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MethodOption({ active, onClick, title, note }: {
  active: boolean; onClick: () => void; title: string; note?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-xl border-2 px-4 py-4 text-right transition ${
        active ? 'border-[#1E3A5F] bg-[#1E3A5F]/5' : 'border-stone-300 hover:border-stone-400'
      }`}
    >
      <span className="text-lg font-medium text-stone-900">{title}</span>
      {note && <span className="text-base text-stone-500">{note}</span>}
    </button>
  )
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-lg font-semibold text-stone-800">
        {label}{required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="text-sm text-stone-500">{hint}</span>}
    </label>
  )
}
