'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Search, X, Plus, Minus, Loader2, Check, Banknote, CreditCard,
  LogOut, AlertTriangle, Package, ShoppingBag,
} from 'lucide-react'
import { fmtAgorot } from '@/lib/bookFairPricing'
import NedarimIframe from '../NedarimIframe'
import PickupPanel from './PickupPanel'

// ─────────────────────────────────────────────────────────────────────────────
// דוכן המכירה ביריד.
//
// הקהל כאן הוא מוכר שעומד מול לקוח ורוצה לסיים מהר: סורק ברקוד, רואה
// סכום, בוחר מזומן או אשראי, ומסיים. לכן אין כאן טפסים — יש סל וכפתור.
//
// 🔴 מלאי הדוכן נפרד מהמלאי המקוון, ואינו חוסם מכירה. הוא מוצג כדי
// שהמוכר יידע מה הולך לאזול, לא כדי למנוע ממנו למכור.
// ─────────────────────────────────────────────────────────────────────────────

type Book = {
  id: string; sku: string; title: string
  author: string | null; publisher: string | null; description: string | null
  volumes: number; price_agorot: number
  stock_fair: number; fair_low_threshold: number | null
}

/** רף ברירת המחדל להתראת "הולך לאזול". */
const DEFAULT_LOW = 3

export default function SellerClient() {
  const [seller, setSeller] = useState<string | null>(null)
  /** מכירה בדוכן או איסוף הזמנה שהוזמנה באתר/בטלפון. */
  const [mode, setMode] = useState<'sale' | 'pickup'>('sale')
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)

  // ── התחברות ──
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')

  // ── הסל ──
  const [cart, setCart] = useState<Map<string, number>>(new Map())
  const [query, setQuery] = useState('')
  const [saleBusy, setSaleBusy] = useState(false)
  const [done, setDone] = useState<{ orderNumber: string; total: number; warning: string | null } | null>(null)
  /** סליקה פעילה — מסך התשלום של נדרים. */
  const [payment, setPayment] = useState<
    { transactionId: string; key: string; orderNumber: string; total: number } | null
  >(null)
  const [saleError, setSaleError] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/yerid/seller/catalog', { cache: 'no-store' })
      if (res.status === 401) { setSeller(null); return }
      const d = await res.json()
      if (!res.ok) { setLoginError(d.error ?? 'טעינת הקטלוג נכשלה'); return }
      setBooks(d.books ?? [])
      setSeller(d.seller ?? null)
    } catch {
      setLoginError('טעינת הקטלוג נכשלה — בדקו את החיבור')
    } finally {
      setLoading(false)
    }
  }, [])

  // ⚠️ setTimeout(0) — כמו במסך הזיכויים: הכלל set-state-in-effect
  // מסמן גם טעינה אסינכרונית תקינה.
  useEffect(() => {
    const t = setTimeout(() => { void loadCatalog() }, 0)
    return () => clearTimeout(t)
  }, [loadCatalog])

  // ⚠️ מיקוד אוטומטי לשדה החיפוש: סורק הברקוד "מקליד", ובלי מיקוד
  // ההקלדה נעלמת. אותו דפוס כמו בחנות.
  useEffect(() => {
    // ⚠️ רק במסך המכירה: במסך האיסוף ההקלדה שייכת לשדה החיפוש שלו.
    if (!seller || done || mode !== 'sale') return
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [seller, done, mode])

  async function login() {
    setLoginError(''); setLoginBusy(true)
    try {
      const res = await fetch('/api/yerid/seller/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      })
      const d = await res.json()
      if (!res.ok) { setLoginError(d.error ?? 'ההתחברות נכשלה'); return }
      setPassword('')
      await loadCatalog()
    } catch {
      setLoginError('ההתחברות נכשלה — בדקו את החיבור')
    } finally {
      setLoginBusy(false)
    }
  }

  async function logout() {
    await fetch('/api/yerid/seller/login', { method: 'DELETE' }).catch(() => {})
    setSeller(null); setCart(new Map()); setBooks([])
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const exact = books.filter(b => b.sku.toLowerCase() === q)
    const rest = books.filter(b =>
      b.sku.toLowerCase() !== q &&
      (b.sku.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)))
    return [...exact, ...rest].slice(0, 30)
  }, [books, query])

  const lines = useMemo(() => {
    const out: { book: Book; qty: number }[] = []
    for (const [id, qty] of cart) {
      const book = books.find(b => b.id === id)
      if (book) out.push({ book, qty })
    }
    return out
  }, [cart, books])

  const total = lines.reduce((s, l) => s + l.book.price_agorot * l.qty, 0)
  const count = lines.reduce((s, l) => s + l.qty, 0)

  const addBook = useCallback((b: Book) => {
    setCart(c => new Map(c).set(b.id, (c.get(b.id) ?? 0) + 1))
    setQuery('')
    searchRef.current?.focus()
  }, [])

  function setQty(id: string, qty: number) {
    setCart(c => {
      const next = new Map(c)
      if (qty <= 0) next.delete(id)
      else next.set(id, Math.min(99, qty))
      return next
    })
  }

  /**
   * רישום מכירה.
   *
   * @param method  cash = תיעוד בלבד (הכסף עבר ביד) · card = סליקה אמיתית
   * @param charge  אשראי בלבד: true פותח את מסך הסליקה של נדרים.
   *                false מתעד תשלום שנעשה במכשיר חיצוני.
   */
  async function sell(method: 'cash' | 'card', charge = false) {
    if (!lines.length) return
    setSaleError(''); setSaleBusy(true)
    try {
      const res = await fetch('/api/yerid/seller/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lines.map(l => ({ book_id: l.book.id, quantity: l.qty })),
          payment_method: method,
          charge,
        }),
      })
      const d = await res.json()
      if (res.status === 401) { setSeller(null); return }
      if (!res.ok) { setSaleError(d.error ?? 'רישום המכירה נכשל'); return }

      // 🔴 סליקה: המכירה *טרם* הושלמה. פותחים את מסך התשלום, והעגלה
      // נשארת עד שהתשלום מאושר — אחרת כישלון סליקה היה מוחק את הסל
      // והמוכר היה צריך לסרוק הכול מחדש מול הלקוח.
      if (d.pendingPayment && d.iframeTransaction) {
        setPayment({ ...d.iframeTransaction, orderNumber: d.orderNumber, total: d.total_agorot })
        return
      }

      setDone({ orderNumber: d.orderNumber, total: d.total_agorot, warning: d.stockWarning ?? null })
      setCart(new Map())
      // ⚠️ רענון הקטלוג כדי שמלאי הדוכן במסך יתעדכן אחרי הניכוי.
      void loadCatalog()
    } catch {
      setSaleError('רישום המכירה נכשל — בדקו את החיבור')
    } finally {
      setSaleBusy(false)
    }
  }

  // ── מסך טעינה ──
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF7F0]">
        <Loader2 size={28} className="animate-spin text-[#6B2737]" />
      </div>
    )
  }

  // ── מסך התחברות ──
  if (!seller) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF7F0] px-5">
        <div className="w-full max-w-sm rounded-2xl border border-[#141210]/8 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-[#12314F]">דוכן היריד</h1>
          <p className="mt-1.5 text-base text-[#141210]/55">כניסה למוכרים</p>

          <div className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="font-semibold text-[#141210]">השם שלך</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="לתיעוד המכירות"
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-semibold text-[#141210]">סיסמת הדוכן</span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && name.trim() && password) void login() }}
                dir="ltr"
                className={INPUT}
              />
            </label>

            {loginError && (
              <p className="rounded-xl border-2 border-[#6B2737]/30 bg-[#6B2737]/5 px-4 py-3 text-base text-[#6B2737]">
                {loginError}
              </p>
            )}

            <button
              onClick={login}
              disabled={loginBusy || !name.trim() || !password}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#6B2737] py-3.5 text-lg font-semibold text-white transition hover:bg-[#141210] disabled:opacity-40"
            >
              {loginBusy && <Loader2 size={18} className="animate-spin" />}
              כניסה
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── מסך הסליקה ──
  //
  // 🔴 העגלה נשמרת עד שהתשלום מאושר: כישלון סליקה מול לקוח שעומד
  // בדוכן אינו אמור לאלץ סריקה מחדש של כל הספרים.
  if (payment) {
    return (
      <div className="min-h-screen bg-[#FAF7F0] px-4 py-6">
        <div className="mx-auto max-w-lg">
          <div className="mb-4 rounded-2xl border border-[#141210]/8 bg-white p-4 text-center">
            <p className="text-sm text-[#141210]/55">הזמנה {payment.orderNumber}</p>
            <p className="text-3xl font-bold tabular-nums text-[#6B2737]">{fmtAgorot(payment.total)}</p>
          </div>
          <NedarimIframe
            transactionId={payment.transactionId}
            key_={payment.key}
            // 🔴 רק כאן: בדוכן יש קורא כרטיסים, בחנות הציבורית אין.
            cardReader
            onSuccess={() => {
              setDone({ orderNumber: payment.orderNumber, total: payment.total, warning: null })
              setPayment(null)
              setCart(new Map())
              void loadCatalog()
            }}
            onBack={() => {
              // ⚠️ ביטול אינו מוחק את הסל — המוכר עשוי לעבור למזומן.
              setPayment(null)
              setSaleError('התשלום בוטל. אפשר לנסות שוב או לגבות במזומן.')
            }}
          />
        </div>
      </div>
    )
  }

  // ── מסך אישור מכירה ──
  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF7F0] px-5">
        <div className="w-full max-w-sm rounded-2xl border border-[#141210]/8 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#2D5016]/10">
            <Check size={32} strokeWidth={3} className="text-[#2D5016]" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-[#2D5016]">המכירה נרשמה</h2>
          <p className="mt-2 text-lg text-[#141210]/70">
            {fmtAgorot(done.total)} · הזמנה {done.orderNumber}
          </p>

          {done.warning && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-right text-sm text-amber-800">
              <AlertTriangle size={17} className="mt-0.5 flex-shrink-0" />
              {done.warning}
            </p>
          )}

          <button
            onClick={() => { setDone(null); setTimeout(() => searchRef.current?.focus(), 50) }}
            className="mt-6 w-full rounded-xl bg-[#141210] py-3.5 text-lg font-semibold text-white transition hover:bg-[#6B2737]"
          >
            מכירה חדשה
          </button>
        </div>
      </div>
    )
  }

  // ── מסך המכירה ──
  const lowStock = books.filter(b => b.stock_fair > 0 && b.stock_fair <= (b.fair_low_threshold ?? DEFAULT_LOW))

  return (
    <div className="min-h-screen bg-[#FAF7F0] pb-40">
      <header className="border-b border-[#141210]/8 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <h1 className="text-xl font-bold text-[#12314F]">דוכן היריד</h1>
            <p className="text-sm text-[#141210]/50">{seller}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-[#141210]/55 transition hover:bg-[#141210]/5 hover:text-[#141210]"
          >
            <LogOut size={16} /> יציאה
          </button>
        </div>
        <div className="mx-auto flex max-w-3xl gap-1 px-5 pb-3" role="tablist">
          {([['sale', 'מכירה'], ['pickup', 'איסוף הזמנה']] as const).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-xl py-2.5 text-base font-semibold transition ${
                mode === m ? 'bg-[#12314F] text-white' : 'bg-[#141210]/5 text-[#141210]/60 hover:bg-[#141210]/10'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {mode === 'pickup' ? (
        <main className="mx-auto max-w-3xl px-5 py-5">
          <PickupPanel onUnauthorized={() => setSeller(null)} />
        </main>
      ) : (
      <main className="mx-auto max-w-3xl px-5 py-5">
        {/* ── סריקה / חיפוש ── */}
        <div className="relative">
          <Search size={19} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#141210]/30" />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            // 🔴 Enter = סוף סריקת ברקוד. מוסיף ומנקה, כדי שהסריקה
            // הבאה תתחיל נקייה בלי מחיקה ידנית.
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              const q = query.trim().toLowerCase()
              if (!q) return
              const hit = books.find(b => b.sku.toLowerCase() === q)
                ?? (filtered.length === 1 ? filtered[0] : null)
              if (hit) addBook(hit)
            }}
            placeholder="סריקת ברקוד או חיפוש"
            autoFocus
            className="w-full rounded-xl border-2 border-[#141210]/10 bg-white py-4 pr-12 pl-10 text-lg outline-none transition placeholder:text-[#141210]/30 focus:border-[#B8860B]"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); searchRef.current?.focus() }}
              aria-label="ניקוי"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[#141210]/35 hover:text-[#141210]"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* ── תוצאות החיפוש ── */}
        {filtered.length > 0 && (
          <ul className="mt-3 overflow-hidden rounded-xl border border-[#141210]/10 bg-white">
            {filtered.map(b => (
              <li key={b.id}>
                <button
                  onClick={() => addBook(b)}
                  className="flex w-full items-center gap-3 border-b border-[#141210]/5 px-4 py-3 text-right transition last:border-0 hover:bg-[#FAF7F0]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-[#12314F]">{b.title}</span>
                    <span className="block text-sm text-[#141210]/45">
                      {b.sku} · {fmtAgorot(b.price_agorot)}
                      {b.stock_fair > 0 && ` · ${b.stock_fair} בדוכן`}
                    </span>
                  </span>
                  <Plus size={20} className="flex-shrink-0 text-[#6B2737]" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {query && !filtered.length && (
          <p className="mt-3 rounded-xl bg-white px-4 py-4 text-center text-base text-[#141210]/50">
            לא נמצא ספר תואם
          </p>
        )}

        {/* ── הסל ── */}
        {lines.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-2">
            {lines.map(l => (
              <li key={l.book.id} className="rounded-xl border border-[#141210]/8 bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 font-semibold leading-snug text-[#12314F]">{l.book.title}</p>
                  <button
                    onClick={() => setQty(l.book.id, 0)}
                    aria-label="הסרה"
                    className="-mt-1 flex-shrink-0 rounded-lg p-1.5 text-[#141210]/30 hover:bg-[#6B2737]/10 hover:text-[#6B2737]"
                  >
                    <X size={17} />
                  </button>
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <div className="flex items-center rounded-lg border border-[#141210]/15 bg-[#FAF7F0]">
                    <button onClick={() => setQty(l.book.id, l.qty - 1)} aria-label="הפחתה"
                      className="flex h-10 w-10 items-center justify-center text-[#141210]/60">
                      <Minus size={16} />
                    </button>
                    <span className="min-w-[2.5rem] text-center text-lg font-bold tabular-nums">{l.qty}</span>
                    <button onClick={() => setQty(l.book.id, l.qty + 1)} aria-label="הוספה"
                      className="flex h-10 w-10 items-center justify-center text-[#141210]/60">
                      <Plus size={16} />
                    </button>
                  </div>
                  <span className="text-lg font-bold tabular-nums text-[#6B2737]">
                    {fmtAgorot(l.book.price_agorot * l.qty)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : !query && (
          <div className="mt-8 flex flex-col items-center gap-3 py-10 text-center">
            <ShoppingBag size={40} className="text-[#141210]/15" />
            <p className="text-lg text-[#141210]/45">סרקו ברקוד כדי להתחיל</p>
          </div>
        )}

        {/* ── מלאי שהולך לאזול ──
            ⚠️ מידע בלבד: אינו חוסם מכירה. הספר עשוי להיות בארגז
            ולא נספר, ולכן זו התראה ולא מגבלה. */}
        {!lines.length && !query && lowStock.length > 0 && (
          <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
              <Package size={15} /> הולך לאזול בדוכן
            </h2>
            <ul className="mt-2 flex flex-col gap-1">
              {lowStock.slice(0, 8).map(b => (
                <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-amber-900">{b.title}</span>
                  <span className="flex-shrink-0 font-bold tabular-nums text-amber-800">{b.stock_fair}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      )}

      {/* ── סרגל התשלום ── */}
      {mode === 'sale' && lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-[#141210]/10 bg-white p-4 shadow-[0_-4px_16px_rgba(20,18,16,0.08)]">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-base text-[#141210]/60">
                {count} {count === 1 ? 'ספר' : 'ספרים'}
              </span>
              <span className="text-2xl font-bold tabular-nums text-[#6B2737]">{fmtAgorot(total)}</span>
            </div>

            {saleError && (
              <p className="mb-3 rounded-xl border-2 border-[#6B2737]/30 bg-[#6B2737]/5 px-4 py-2.5 text-sm text-[#6B2737]">
                {saleError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => sell('cash')}
                disabled={saleBusy}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2D5016] py-4 text-lg font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {saleBusy ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={19} />}
                מזומן
              </button>
              {/* 🔴 סליקה אמיתית מול נדרים — הלקוח מזין כרטיס כאן. */}
              <button
                onClick={() => sell('card', true)}
                disabled={saleBusy}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#12314F] py-4 text-lg font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {saleBusy ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={19} />}
                אשראי
              </button>
            </div>

            {/* ⚠️ מסלול שלישי, נפרד ומוקטן: תיעוד תשלום שנגבה במכשיר
                סליקה חיצוני. בלי ההפרדה המוכר לא היה יודע אם הלחיצה
                גובה כסף או רק רושמת. */}
            <button
              onClick={() => sell('card', false)}
              disabled={saleBusy}
              className="mt-2 w-full rounded-lg border border-[#141210]/12 py-2 text-sm text-[#141210]/55 transition hover:bg-[#141210]/5 disabled:opacity-40"
            >
              שולם במכשיר חיצוני — רישום בלבד
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const INPUT = 'w-full rounded-xl border-2 border-[#141210]/15 bg-white px-4 py-3 text-lg outline-none transition focus:border-[#B8860B]'
