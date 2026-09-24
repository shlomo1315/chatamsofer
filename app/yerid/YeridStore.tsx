'use client'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { Search, ShoppingBag, Plus, Minus, X, Check } from 'lucide-react'
import { fmtAgorot, bookImageUrl } from '@/lib/bookFairPricing'
import { shippingCost, totalVolumes } from '@/lib/bookFairShipping'
import { cleanEmail, emailError } from '@/lib/emailAddress'
import type { PublicBook, PublicCity, PublicTier } from './page'
import Countdown from './Countdown'

// חנות יריד הספרים.
//
// ההחלטה העיצובית: יריד ספרים הוא *מקום שמסתובבים בו*, לא טופס חיפוש.
// לכן הדף נפתח במדף הספרים עצמו, והחיפוש יושב מעליו ככלי ולא כשער.
//
// הפלטה לקוחה מעולם הספר: דיו כהה, קלף, וזהב עתיק — הרצועה העליונה
// בנויה כמו שער של ספר.
//
// קהל היעד כולל קונים מבוגרים ומכשירים ישנים: טיפוגרפיה גדולה, אזורי
// לחיצה 48 פיקסל, בלי אנימציות כניסה. הרגע היחיד של תנועה הוא כשספר
// נכנס לעגלה — הוא עונה על פעולה של אדם ומראה מה השתנה.

type CartLine = { book: PublicBook; quantity: number }

const CART_KEY = 'book_fair_cart_v1'

export default function YeridStore({ books, cities, tiers, open, openAt }: {
  books: PublicBook[]; cities: PublicCity[]; tiers: PublicTier[]; open: boolean
  /** מועד הפתיחה המתוכנן (ISO) — לספירה לאחור במסך ההמתנה. */
  openAt: string | null
}) {
  const [query, setQuery] = useState('')

  // ⚠️ אתחול עצל ולא טעינה ב-useEffect: טעינה באפקט הייתה מרנדרת פעם
  // אחת עם עגלה ריקה ואז שוב עם המלאה — הקונה היה רואה את העגלה שלו
  // "נעלמת" לרגע.
  // ⚠️ עטוף ב-try: דפדפן בגלישה פרטית זורק כאן.
  const [cart, setCart] = useState<Map<string, number>>(() => {
    if (typeof window === 'undefined') return new Map()
    try {
      const saved = localStorage.getItem(CART_KEY)
      if (!saved) return new Map()
      const parsed = JSON.parse(saved) as [string, number][]
      return new Map(parsed.filter(([id, q]) => typeof id === 'string' && typeof q === 'number' && q > 0))
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
    // ⚠️ התאמת מק"ט מדויקת קופצת לראש: מי שהקליד מק"ט יודע מה הוא רוצה
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
    setTimeout(() => setJustAdded(v => v === b.id ? null : v), 1400)
  }, [])

  const setQty = useCallback((id: string, qty: number) => {
    setCart(c => {
      const next = new Map(c)
      if (qty <= 0) next.delete(id)
      else next.set(id, Math.min(99, qty))
      return next
    })
  }, [])

  // ── היריד סגור — מסך המתנה עם רישום לתזכורת ──
  if (!open) return <ClosedScreen openAt={openAt} />

  return (
    <div className="min-h-screen bg-[#F5F0E6] pb-28 lg:pb-0">
      {/* ══ שער ══
          ⚠️ רקע כהה וזהב — בנוי כמו שער של ספר, וזה מה שנותן לדף
          נוכחות במקום להיפתח בשדה קלט. */}
      <header className="relative bg-[#141210]">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
          <div className="flex items-start justify-between gap-6">
            <div>
              {/* הלוגו הרשמי — זהה למסך ההמתנה ולשאר המערכת. */}
              <img
                src="/logo.png"
                alt="איגוד הצאצאים של רבינו החתם סופר"
                className="w-24 sm:w-28"
              />
              <h1 className="mt-4 text-4xl font-bold leading-none text-[#F5F0E6] sm:text-5xl">
                יריד הספרים
              </h1>
              <p className="mt-2 text-lg text-[#B8860B]">היכל החתם סופר</p>
              {books.length > 0 && (
                <p className="mt-5 text-base text-[#F5F0E6]/60">
                  {books.length} כותרים · משלוח עד הבית או איסוף עצמי
                </p>
              )}
            </div>

            {/* ⚠️ העגלה גלויה תמיד ולא מוסתרת מאחורי אייקון */}
            <button
              onClick={() => setCartOpen(true)}
              className="hidden items-center gap-3 rounded-lg border border-[#B8860B] px-5 py-3 text-base font-medium text-[#B8860B] transition hover:bg-[#B8860B] hover:text-[#141210] lg:flex"
            >
              <ShoppingBag size={19} />
              {bookCount > 0 ? `${bookCount} ספרים · ${fmtAgorot(itemsTotal)}` : 'העגלה ריקה'}
            </button>
          </div>
        </div>

        {/* פס זהב שמפריד בין השער לקטלוג */}
        <div className="h-1 bg-gradient-to-l from-transparent via-[#B8860B] to-transparent" />
      </header>

      <main className="mx-auto max-w-6xl px-5">
        {books.length === 0 ? (
          <EmptyCatalog />
        ) : (
          <>
            {/* ── חיפוש — כלי, לא שער ── */}
            <div className="relative -mt-7 mb-10">
              <Search size={22} className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[#141210]/30" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="חיפוש לפי שם או מק״ט"
                inputMode="search"
                aria-label="חיפוש ספר"
                className="w-full rounded-lg border-2 border-[#141210]/10 bg-white py-4 pr-14 pl-5 text-lg shadow-sm outline-none transition placeholder:text-[#141210]/30 focus:border-[#B8860B]"
              />
            </div>

            {query && (
              <p className="-mt-6 mb-6 text-base text-[#141210]/50">
                {filtered.length ? `${filtered.length} ספרים` : 'לא נמצאו ספרים בחיפוש זה'}
              </p>
            )}

            {/* ── המדף ── */}
            <div className="grid grid-cols-1 gap-x-5 gap-y-8 pb-16 sm:grid-cols-2 lg:grid-cols-3">
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
          </>
        )}
      </main>

      {/* ── סרגל תחתון בנייד ── */}
      {bookCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-[#B8860B] bg-[#141210] p-4 lg:hidden">
          <button
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between text-lg font-medium text-[#F5F0E6]"
          >
            <span className="flex items-center gap-2"><ShoppingBag size={20} /> {bookCount} ספרים</span>
            <span className="text-[#B8860B]">{fmtAgorot(itemsTotal)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <CartPanel
          lines={lines} cities={cities} tiers={tiers}
          onClose={() => setCartOpen(false)} onSetQty={setQty}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

/** קישוט השער — צורה גיאומטרית פשוטה, לא אייקון גנרי. */
/**
 * מסך ההמתנה לפני פתיחת היריד.
 *
 * ⚠️ אינו "הודעת סגירה" אלא דף נחיתה: מי שמגיע לכאן התעניין מספיק כדי
 * להקליד את הכתובת, ושורה אחת של "ייפתח בקרוב" מבזבזת את זה. הרישום
 * לתזכורת הופך ביקור אבוד לפנייה שתחזור ביום הפתיחה.
 */
function ClosedScreen({ openAt }: { openAt: string | null }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const v = cleanEmail(email)
    // ⚠️ בדיקה בלקוח כדי לא לשלוח בקשה סתם; השרת מאמת שוב באותם כללים.
    const msg = emailError(v)
    if (msg) { setError(msg); return }

    setState('sending'); setError('')
    try {
      const res = await fetch('/api/yerid/remind-me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: v }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'הרישום נכשל'); setState('idle'); return }
      setState('done')
    } catch {
      setError('הרישום נכשל — בדקו את החיבור')
      setState('idle')
    }
  }

  return (
    // ⚠️ רקע כחול בהיר ולא כהה: הלוגו הוא חותם זהב, וזהב על כמעט-שחור
    // מאבד ניגודיות — הוא "נבלע" ברקע במקום לשבת עליו. כחול בהיר הוא
    // הצבע המשלים לזהב, ומבליט אותו בלי להתחרות בו.
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#EAF4FC] via-[#DCEBF8] to-[#CFE2F3] px-6 py-16 text-center">
      {/* ⚠️ הלוגו הרשמי ולא עיטור מעוצב: זה הסמל שמופיע בכל המערכת
          ובמיילים, והוא מה שמזהה את העמותה מול הקהל. */}
      <img
        src="/logo-heichal.png"
        alt="היכל החתם סופר"
        className="w-44 sm:w-56"
      />

      <h1 className="mt-6 text-3xl font-bold leading-tight text-[#12314F] sm:text-4xl">
        מערכת הזמנת ספרי החתם סופר
      </h1>
      <p className="mt-2 text-lg font-semibold text-[#8A6212]">שע״י היכל החתם סופר</p>

      {/* ── מועד הפתיחה + ספירה לאחור — הלב של הדף ──
          ⚠️ התאריך מגיע מההגדרות ולא קבוע בקוד: דחיית מועד היא שינוי
          במסך ההגדרות, ובלי פריסה. */}
      <Countdown openAt={openAt} />

      {/* ── תזכורת ── */}
      <div className="mt-10 w-full max-w-md">
        {state === 'done' ? (
          // ⚠️ אישור מפורש ומפורט: "נרשמת" לבד משאיר ספק אם באמת נקלט.
          <div className="rounded-2xl border border-[#0F7B4F]/25 bg-white/70 px-6 py-7 shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#0F7B4F]">
              <Check size={26} className="text-white" strokeWidth={3} />
            </div>
            <p className="text-lg font-bold text-[#12314F]">הכתובת נקלטה במערכת</p>
            <p className="mt-2 text-base leading-relaxed text-[#3B5670]">
              נשלח אליכם תזכורת במייל ברגע שהמערכת תיפתח.
              <br />
              תודה על ההתעניינות!
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-base leading-relaxed text-[#3B5670]">
              רוצים שנזכיר לכם?
              <br />
              השאירו כתובת מייל ונעדכן אתכם ברגע שהמערכת נפתחת.
            </p>

            <form onSubmit={submit} noValidate className="flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                // ⚠️ הבדיקה רצה גם ביציאה מהשדה ולא רק בשליחה: מי
                // שמקליד כתובת פגומה מגלה זאת מיד, ולא אחרי לחיצה.
                onBlur={() => { const m = emailError(email); if (m) setError(m) }}
                placeholder="הכניסו כתובת מייל"
                dir="ltr"
                inputMode="email"
                autoComplete="email"
                // ⚠️ אזור לחיצה גדול וטיפוגרפיה גדולה — קהל היעד כולל
                // קונים מבוגרים ומכשירים ישנים.
                className={`w-full rounded-xl border-2 bg-white px-5 py-4 text-center text-lg text-[#12314F] outline-none transition placeholder:text-[#8AA5BD] ${
                  error ? 'border-red-400' : 'border-[#9DC3E6] focus:border-[#B8860B]'
                }`}
                disabled={state === 'sending'}
                aria-invalid={!!error}
              />

              {error && (
                <p className="text-base font-medium text-red-700">{error}</p>
              )}

              <button
                type="submit"
                disabled={state === 'sending' || !email.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#B8860B] px-6 py-4 text-lg font-bold text-white shadow-sm transition hover:bg-[#9d730a] disabled:opacity-40"
              >
                {state === 'sending' ? 'שולח…' : 'שלחו לי תזכורת'}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="mt-12 text-sm text-[#3B5670]/60">
        היכל החתם סופר
      </p>
    </main>
  )
}

/**
 * כריכה חסרה — שדרת ספר מעוצבת עם השם.
 *
 * ⚠️ לא חור אפור בפריסה: הקטלוג צריך להיראות שלם גם לפני שכל התמונות
 * הועלו, אחרת הוא נראה שבור ולא חסר.
 */
function NoCover({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex h-full w-[38%] min-w-[74px] flex-col items-center justify-center rounded-sm bg-[#6B2737] px-2 py-4 text-center">
        <span className="line-clamp-4 text-[13px] font-semibold leading-snug text-[#F5F0E6]/90">
          {title}
        </span>
      </div>
    </div>
  )
}

/**
 * כרטיס ספר.
 *
 * ⚠️ התמונה היא הגיבור — כמו בכל חנות ספרים. ביחס 3:4 קבוע, כך
 * שהמדף נשאר מיושר גם כשהכריכות בגדלים שונים.
 *
 * ⚠️ ספר בלי תמונה אינו מקבל חור בפריסה אלא שדרת ספר מעוצבת עם שמו —
 * כך הקטלוג נראה שלם גם לפני שכל התמונות הועלו.
 */
function BookCard({ book, inCart, justAdded, onAdd, onSetQty }: {
  book: PublicBook; inCart: number; justAdded: boolean
  onAdd: () => void; onSetQty: (q: number) => void
}) {
  const out = !book.in_stock
  const img = bookImageUrl(book.image_path)

  return (
    <article className={`group relative flex overflow-hidden rounded-l-md bg-white shadow-[0_1px_3px_rgba(20,18,16,0.08)] transition ${
      out ? 'opacity-55' : 'hover:shadow-[0_4px_16px_rgba(20,18,16,0.12)]'
    }`}>
      {/* שדרת הספר */}
      <div className={`w-2.5 flex-shrink-0 ${out ? 'bg-[#141210]/20' : 'bg-[#6B2737]'}`} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── הכריכה ── */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#141210]/[0.04]">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt={book.title}
              loading="lazy"
              // ⚠️ contain ולא cover: כריכת ספר אסור שתיחתך — הכותרת
              // יושבת בדרך כלל למעלה, וחיתוך מוחק אותה.
              className="h-full w-full object-contain p-3"
            />
          ) : (
            <NoCover title={book.title} />
          )}
          {out && (
            <span className="absolute right-3 top-3 rounded bg-[#141210]/85 px-2.5 py-1 text-sm font-medium text-[#F5F0E6]">
              אזל
            </span>
          )}
        </div>

      <div className="flex min-w-0 flex-1 flex-col p-5">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <span className="rounded bg-[#F5F0E6] px-2 py-1 font-mono text-sm font-semibold tracking-wide text-[#141210]/70">
            {book.sku}
          </span>
          {book.volumes > 1 && (
            <span className="flex-shrink-0 text-sm text-[#141210]/45">{book.volumes} כרכים</span>
          )}
        </div>

        <h2 className="text-[20px] font-bold leading-snug text-[#141210]">{book.title}</h2>

        {(book.author || book.publisher) && (
          <p className="mt-1.5 text-base leading-relaxed text-[#141210]/55">
            {[book.author, book.publisher].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* ⚠️ התיאור נשלף ונערך במסך הקטלוג מהיום הראשון ולא הוצג כאן —
            המזכירה כתבה תיאורים שאיש לא ראה. מוגבל לשלוש שורות כדי
            שהכרטיסים יישארו באותו גובה ברשת. */}
        {book.description && (
          <p className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-[#141210]/45">
            {book.description}
          </p>
        )}

        <div className="mt-5 flex items-end justify-between gap-3 border-t border-[#141210]/8 pt-4">
          <span className="text-[26px] font-bold leading-none text-[#6B2737]">
            {fmtAgorot(book.price_agorot)}
          </span>

          {out ? (
            // ⚠️ ריק: התג כבר מוצג על הכריכה, וכפילות רק מבלבלת
            <span />
          ) : inCart > 0 ? (
            <div className="flex items-center rounded-lg border-2 border-[#6B2737]">
              <button onClick={() => onSetQty(inCart - 1)} aria-label="הפחתת כמות"
                className="flex h-12 w-12 items-center justify-center text-[#6B2737] transition hover:bg-[#6B2737]/5">
                <Minus size={19} />
              </button>
              <span className="min-w-[2.25rem] text-center text-xl font-bold tabular-nums">{inCart}</span>
              <button onClick={() => onSetQty(inCart + 1)} aria-label="הוספת כמות"
                className="flex h-12 w-12 items-center justify-center text-[#6B2737] transition hover:bg-[#6B2737]/5">
                <Plus size={19} />
              </button>
            </div>
          ) : (
            // ⚠️ הרגע היחיד של תנועה בדף: הכפתור עונה לפעולה של הקונה
            // ומראה בבירור שהספר נכנס.
            <button
              onClick={onAdd}
              className={`flex min-h-[48px] items-center gap-2 rounded-lg px-6 text-base font-semibold transition-colors duration-200 ${
                justAdded
                  ? 'bg-[#2D5016] text-white'
                  : 'bg-[#141210] text-[#F5F0E6] hover:bg-[#6B2737]'
              }`}
            >
              {justAdded ? <><Check size={18} /> נוסף</> : 'הוספה'}
            </button>
          )}
        </div>
        </div>
      </div>
    </article>
  )
}

/** ⚠️ מצב ריק הוא הזמנה לפעולה, לא הודעת מצב. */
function EmptyCatalog() {
  return (
    <div className="py-24 text-center">
      <p className="text-2xl font-bold text-[#141210]">הקטלוג נפתח בקרוב</p>
      <p className="mx-auto mt-3 max-w-sm text-lg leading-relaxed text-[#141210]/55">
        הספרים עולים לאתר בימים אלה. חזרו לבקר.
      </p>
    </div>
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
  // 🔴 המשלוח לפי כרכים ולא לפי פריטים — זהה לחישוב בשרת
  // (validateCheckout). פער בין השניים מציג ללקוח מחיר אחד וגובה אחר.
  const volumeCount = totalVolumes(lines.map(l => ({ volumes: l.book.volumes, quantity: l.quantity })))
  const itemsTotal = lines.reduce((s, l) => s + l.book.price_agorot * l.quantity, 0)
  const ship = shippingCost(method, volumeCount, tiers)
  const total = itemsTotal + (ship ?? 0)

  async function submit() {
    setError(''); setBusy(true)
    try {
      const res = await fetch('/api/yerid/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lines.map(l => ({ book_id: l.book.id, quantity: l.quantity })),
          delivery_method: method,
          city_id: method === 'shipping' ? cityId : null,
          address_text: method === 'shipping' ? form.address : null,
          customer_name: form.name, customer_phone: form.phone, customer_email: form.email,
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
    <div className="fixed inset-0 z-50 flex justify-start bg-[#141210]/60" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col bg-[#F5F0E6]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b-2 border-[#B8860B] bg-[#141210] px-5 py-4">
          <h2 className="text-xl font-bold text-[#F5F0E6]">
            {step === 'cart' ? 'העגלה שלי' : 'פרטי ההזמנה'}
          </h2>
          <button onClick={onClose} aria-label="סגירה" className="rounded p-2 text-[#F5F0E6]/60 hover:text-[#F5F0E6]">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'cart' ? (
            !lines.length ? (
              <p className="py-16 text-center text-lg text-[#141210]/50">העגלה ריקה</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {lines.map(l => (
                  <li key={l.book.id} className="flex items-start gap-3 rounded-md bg-white p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm text-[#141210]/45">{l.book.sku}</p>
                      <p className="text-[17px] font-semibold leading-snug text-[#141210]">{l.book.title}</p>
                      <p className="mt-1 text-base text-[#141210]/55">{fmtAgorot(l.book.price_agorot)} ליחידה</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center rounded border-2 border-[#141210]/15">
                        <button onClick={() => onSetQty(l.book.id, l.quantity - 1)} aria-label="הפחתה"
                          className="flex h-10 w-10 items-center justify-center text-[#141210]/60">
                          <Minus size={16} />
                        </button>
                        <span className="min-w-[2rem] text-center text-lg font-bold tabular-nums">{l.quantity}</span>
                        <button onClick={() => onSetQty(l.book.id, l.quantity + 1)} aria-label="הוספה"
                          className="flex h-10 w-10 items-center justify-center text-[#141210]/60">
                          <Plus size={16} />
                        </button>
                      </div>
                      <span className="text-lg font-bold text-[#6B2737]">
                        {fmtAgorot(l.book.price_agorot * l.quantity)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="flex flex-col gap-5">
              <fieldset>
                <legend className="mb-2 text-lg font-semibold text-[#141210]">איך לקבל את הספרים?</legend>
                <div className="flex flex-col gap-2">
                  <MethodOption active={method === 'pickup'} onClick={() => setMethod('pickup')}
                    title="איסוף עצמי מהיריד" note="ללא עלות" />
                  <MethodOption active={method === 'shipping'} onClick={() => setMethod('shipping')}
                    title="משלוח עד הבית"
                    note={method === 'shipping' && ship === null ? 'לא הוגדר תעריף' : undefined} />
                </div>
              </fieldset>

              {method === 'shipping' && (
                <>
                  <Field label="עיר" required>
                    <select value={cityId} onChange={e => setCityId(e.target.value)} className={INPUT}>
                      <option value="">בחרו עיר</option>
                      {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {/* ⚠️ אמירה מפורשת: לקוח שאינו מוצא את עירו צריך
                        להבין מיד שאיננו משלחים אליה. */}
                    <span className="mt-1 block text-sm text-[#141210]/50">
                      משלוחים לערים שברשימה בלבד
                    </span>
                  </Field>
                  <Field label="כתובת מלאה" required>
                    <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                      placeholder="רחוב, מספר בית ודירה" className={INPUT} />
                  </Field>
                </>
              )}

              <Field label="שם מלא" required>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={INPUT} />
              </Field>
              <Field label="טלפון" required>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  inputMode="tel" dir="ltr" className={INPUT} />
              </Field>
              <Field label="אימייל" hint="לקבלת אישור וקישור למעקב">
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  inputMode="email" dir="ltr" className={INPUT} />
              </Field>

              {error && (
                <p className="rounded-md border-2 border-[#6B2737]/30 bg-[#6B2737]/5 px-4 py-3 text-base text-[#6B2737]">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="border-t-2 border-[#141210]/10 bg-white px-5 py-4">
            <dl className="mb-3 flex flex-col gap-1.5 text-base">
              <div className="flex justify-between text-[#141210]/70">
                <dt>{bookCount} ספרים</dt>
                <dd className="tabular-nums">{fmtAgorot(itemsTotal)}</dd>
              </div>
              {step === 'details' && (
                <div className="flex justify-between text-[#141210]/70">
                  <dt>{method === 'pickup' ? 'איסוף עצמי' : 'משלוח'}</dt>
                  <dd className="tabular-nums">
                    {ship === null ? '—' : ship === 0 ? 'ללא עלות' : fmtAgorot(ship)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-t border-[#141210]/10 pt-2 text-xl font-bold text-[#141210]">
                <dt>סך הכול</dt>
                <dd className="tabular-nums text-[#6B2737]">
                  {fmtAgorot(step === 'details' ? total : itemsTotal)}
                </dd>
              </div>
            </dl>

            {step === 'cart' ? (
              <button onClick={() => setStep('details')}
                className="w-full rounded-lg bg-[#141210] py-4 text-lg font-semibold text-[#F5F0E6] transition hover:bg-[#6B2737]">
                המשך להזמנה
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setStep('cart')}
                  className="rounded-lg border-2 border-[#141210]/20 px-5 py-4 text-lg font-medium text-[#141210]/70">
                  חזרה
                </button>
                <button onClick={submit} disabled={busy || ship === null}
                  className="flex-1 rounded-lg bg-[#6B2737] py-4 text-lg font-semibold text-[#F5F0E6] transition hover:bg-[#141210] disabled:opacity-50">
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

const INPUT = 'w-full rounded-md border-2 border-[#141210]/15 bg-white px-4 py-3.5 text-lg outline-none transition focus:border-[#B8860B]'

function MethodOption({ active, onClick, title, note }: {
  active: boolean; onClick: () => void; title: string; note?: string
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center justify-between rounded-md border-2 px-4 py-4 text-right transition ${
        active ? 'border-[#6B2737] bg-white' : 'border-[#141210]/15 hover:border-[#141210]/30'
      }`}>
      <span className="text-lg font-medium text-[#141210]">{title}</span>
      {note && <span className="text-base text-[#141210]/50">{note}</span>}
    </button>
  )
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-lg font-semibold text-[#141210]">
        {label}{required && <span className="text-[#6B2737]"> *</span>}
      </span>
      {children}
      {hint && <span className="text-sm text-[#141210]/50">{hint}</span>}
    </label>
  )
}
