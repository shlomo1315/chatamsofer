'use client'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Search, ShoppingBag, Plus, Minus, X, Check, UserRound, Truck, Loader2, Package } from 'lucide-react'
import { fmtAgorot, bookImageUrl } from '@/lib/bookFairPricing'
import { shippingCost, totalVolumes } from '@/lib/bookFairShipping'
import { categoryColor } from '@/lib/bookFairCategoryColor'
import { cleanEmail, emailError } from '@/lib/emailAddress'
import type { PublicBook, PublicCity, PublicTier } from './page'
import Countdown from './Countdown'
import NedarimIframe from './NedarimIframe'
import StreetPicker from '@/components/ui/StreetPicker'

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

/**
 * מזהה עוגן לקטגוריה.
 *
 * ⚠️ נגזר מהשם ולא מאינדקס: אינדקס משתנה כשקטגוריה נוספת או מתרוקנת,
 * והקישור היה מצביע לקטגוריה אחרת. התווים הלא-תקניים מוחלפים כי
 * getElementById עם רווחים וגרשיים אינו אמין.
 */
const catId = (name: string) =>
  'cat-' + name.replace(/[^֐-׿a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function YeridStore({ books, cities, tiers, open, openAt, previewToken, pickup }: {
  books: PublicBook[]; cities: PublicCity[]; tiers: PublicTier[]; open: boolean
  /** מועד הפתיחה המתוכנן (ISO) — לספירה לאחור במסך ההמתנה. */
  openAt: string | null
  /**
   * אסימון חתום מהנתיב הנסתר (/yerid101315) שמאפשר לבצע הזמנה גם לפני
   * הפתיחה הרשמית. ⚠️ null בחנות הציבורית — ואז ה-checkout חוסם כרגיל.
   */
  previewToken?: string | null
  /**
   * מצב האיסוף העצמי, מחושב בשרת.
   *
   * 🔴 בשרת ולא בלקוח: שעון הדפדפן נתון לשינוי, ולקוח עם שעון מוטה
   * היה רואה "איסוף זמין" אחרי הסגירה. ראו lib/bookFairPickup.
   */
  pickup?: { available: boolean; message: string; ready_hours: number } | null
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
  /** הודעת "נוסף לעגלה" הצפה. ⚠️ שם הספר ולא "נוסף" גנרי — בלחיצות
   *  מהירות ברצף הקונה צריך לדעת *מה* נכנס. */
  const [toast, setToast] = useState<string | null>(null)
  /** גוש מעופף מהכרטיס לעגלה — הפידבק הוויזואלי שהספר "נסע" לסל. */
  const [flight, setFlight] = useState<{ id: number; from: DOMRect } | null>(null)
  const cartBtnRef = useRef<HTMLButtonElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // ── סורק הברקוד ──
  //
  // 🔴 סורק ברקוד מתנהג כמקלדת: הוא "מקליד" את המק"ט ומסיים ב-Enter.
  // שתי בעיות שהתגלו בשימוש אמיתי:
  //   1. המק"ט נשאר בשדה, ולכן הסריקה הבאה נדבקה לקודמת וצריך למחוק ביד.
  //   2. היה צריך ללחוץ על השדה לפני כל סריקה, אחרת ההקלדה הלכה לאיבוד.
  //
  // הפתרון: מיקוד אוטומטי על השדה בכל מקום בדף, וניקויו אחרי Enter.
  //
  // ⚠️ המיקוד *לא* נגזל כשהמוכר מקליד בשדה אחר (טופס ההזמנה) או כשיש
  // חלונית פתוחה — אחרת אי אפשר היה למלא את הטופס בכלל.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (cartOpen) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      // ⚠️ רק תווים מדפיסים: Tab/Escape/חצים חייבים להמשיך לעבוד כרגיל.
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cartOpen])

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

  // ── קיבוץ לקטגוריות ──
  //
  // 🔴 הקטלוג המודפס בנוי בקטגוריות, והחנות צריכה להיראות כמוהו.
  // הקטגוריה יושבת בשדה description (כך הגיעה מהאקסל) והסדר נגזר
  // מקידומת המק"ט — ראו categoryOrder ב-lib/bookFairCatalog.
  //
  // ⚠️ בחיפוש אין קיבוץ: מי שחיפש רוצה לראות את התוצאות לפי רלוונטיות,
  // ופיזורן לכותרות קטגוריה היה מסתיר את ההתאמה המדויקת.
  const groups = useMemo(() => {
    if (query.trim()) return null
    const map = new Map<string, PublicBook[]>()
    for (const b of filtered) {
      const key = (b.description ?? '').trim() || 'נוספים'
      const arr = map.get(key)
      if (arr) arr.push(b)
      else map.set(key, [b])
    }
    return [...map.entries()]
  }, [filtered, query])

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

  const add = useCallback((b: PublicBook, fromEl?: HTMLElement | null) => {
    setCart(c => new Map(c).set(b.id, (c.get(b.id) ?? 0) + 1))
    setJustAdded(b.id)
    setTimeout(() => setJustAdded(v => v === b.id ? null : v), 1400)

    setToast(b.title)
    // ⚠️ טיימר יחיד ב-ref: לחיצות רצופות על ספרים שונים היו מייצרות
    // טיימרים מקבילים, והראשון שמסתיים היה מעלים הודעה של ספר אחר.
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)

    // ⚠️ מדידה מיידית (getBoundingClientRect) ולא ref לאלמנט: הכרטיס
    // מתחלף למצב "בעגלה" מיד אחרי הלחיצה, וה-DOM שלו כבר לא קיים
    // כשהאנימציה מתחילה.
    if (fromEl) {
      const rect = fromEl.getBoundingClientRect()
      const id = Date.now()
      setFlight({ id, from: rect })
      setTimeout(() => setFlight(f => f?.id === id ? null : f), 700)
    }
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
    <div className="min-h-screen bg-[#FAF7F0] pb-28 lg:pb-0">
      {/* ══ שער ══
          ⚠️ רקע בהיר וחם ולא כמעט-שחור. הרקע הכהה היה כבד על העין לאורך
          גלילה ארוכה בקטלוג, והפך את הדף ל"אתר תדמית" במקום לחנות שנוח
          לקנות בה. הזהב נשמר כמבטא על רקע בהיר — שם הוא מבליט במקום
          להתחרות. */}
      {/* ══ שער + סרגל — גוש דביק אחד ══
          🔴 גם הלוגו דביק ולא רק החיפוש: בגלילה ארוכה בקטלוג הזהות
          של האתר נעלמה והקונה איבד הקשר. ⚠️ ריפוד מוקטן בגלילה כדי
          שהגוש לא יבלע חצי מסך בנייד. */}
      <div className="sticky top-0 z-40 border-b border-[#141210]/8 bg-[#FAF7F0]/95 backdrop-blur">
      <header className="border-b border-[#141210]/8 bg-gradient-to-b from-white/80 to-transparent">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              {/* הלוגו הרשמי — זהה למסך ההמתנה ולשאר המערכת. */}
              <img
                src="/logo.png"
                alt="איגוד הצאצאים של רבינו החתם סופר"
                className="w-16 sm:w-20"
              />
              <div>
                <h1 className="text-2xl font-bold leading-tight text-[#141210] sm:text-3xl">
                  יריד הספרים
                </h1>
                <p className="mt-0.5 text-base font-medium text-[#8A6212]">היכל החתם סופר</p>
                {/* 🔴 ערי המשלוח בשער ולא רק בקופה: קונה מחוץ לרשימה
                    גילה זאת רק אחרי שמילא עגלה וטופס. */}
                {cities.length > 0 && (
                  <p className="mt-1 text-sm leading-relaxed text-[#141210]/50">
                    משלוח עד הבית בערים:{' '}
                    <span className="font-semibold text-[#141210]">
                      {cities.map(c => c.name).join(' · ')}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* ⚠️ אזור אישי — מסלול המעקב אחרי הזמנה קיימת. היה קיים
                (/yerid/order/<token>) אך לא היה אליו שום כניסה מהחנות. */}
            <a
              href="/yerid/my-order"
              className="hidden items-center gap-2 rounded-xl border border-[#141210]/12 bg-white px-4 py-2.5 text-sm font-medium text-[#141210]/70 transition hover:border-[#B8860B] hover:text-[#141210] sm:flex"
            >
              <UserRound size={17} /> האזור האישי
            </a>
          </div>
        </div>
      </header>

      {/* ══ סרגל דביק: חיפוש + עגלה ══
          🔴 דביק בכל גלילה. הקטלוג ארוך, והקונה שגלל למטה נאלץ לחזור
          לראש הדף כדי לחפש או לפתוח את הסל — שני הדברים שהוא עושה
          הכי הרבה. */}
      <div>
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
          <div className="relative flex-1">
            <Search size={19} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#141210]/30" />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              // 🔴 Enter = סוף סריקה אצל סורק הברקוד. מוסיפים לעגלה את
              // ההתאמה המדויקת ומנקים את השדה, כדי שהסריקה הבאה תתחיל
              // נקייה — קודם היה צריך למחוק ביד בין ספר לספר.
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                const q = query.trim().toLowerCase()
                if (!q) return
                const hit = books.find(b => b.sku.toLowerCase() === q)
                  ?? (filtered.length === 1 ? filtered[0] : null)
                if (hit && hit.in_stock) {
                  add(hit, cartBtnRef.current)
                  setQuery('')
                }
              }}
              placeholder="חיפוש או סריקת ברקוד"
              inputMode="search"
              aria-label="חיפוש ספר או סריקת ברקוד"
              className="w-full rounded-xl border-2 border-[#141210]/10 bg-white py-3 pr-12 pl-4 text-base outline-none transition placeholder:text-[#141210]/30 focus:border-[#B8860B]"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); searchRef.current?.focus() }}
                aria-label="ניקוי החיפוש"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[#141210]/35 transition hover:bg-[#141210]/5 hover:text-[#141210]"
              >
                <X size={17} />
              </button>
            )}
          </div>

          {/* ⚠️ העגלה גלויה תמיד ולא מוסתרת מאחורי אייקון */}
          <button
            ref={cartBtnRef}
            onClick={() => setCartOpen(true)}
            className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition ${
              bookCount > 0
                ? 'bg-[#6B2737] text-white hover:bg-[#141210]'
                : 'border-2 border-[#141210]/10 bg-white text-[#141210]/50'
            }`}
          >
            <ShoppingBag size={19} />
            <span className="hidden sm:inline">
              {bookCount > 0 ? `${bookCount} · ${fmtAgorot(itemsTotal)}` : 'העגלה ריקה'}
            </span>
            {bookCount > 0 && <span className="sm:hidden">{bookCount}</span>}
          </button>
        </div>
      </div>
      </div>

      <main className="mx-auto max-w-6xl px-5 pt-8">
        {books.length === 0 ? (
          <EmptyCatalog />
        ) : (
          <>
            {query && (
              <p className="mb-6 text-base text-[#141210]/50">
                {filtered.length ? `${filtered.length} ספרים` : 'לא נמצאו ספרים בחיפוש זה'}
              </p>
            )}

            {/* ── המדף ──
                🔴 מסודר בקטגוריות כמו הקטלוג המודפס, ולא בסדר א"ב.
                ⚠️ בחיפוש הקיבוץ מתבטל (groups=null) — התוצאות מוצגות
                לפי רלוונטיות, והתאמת מק"ט מדויקת ראשונה. */}
            {groups ? (
              <div className="pb-16 lg:flex lg:items-start lg:gap-8">
                {/* ── תפריט הקטגוריות ──
                    🔴 ניווט ישיר במקום גלילה דרך 111 ספרים.
                    ⚠️ דביק מתחת לשער (top-[136px]) ולא בראש המסך —
                    אחרת הוא נעלם מאחורי הגוש הדביק שמעליו.
                    ⚠️ מוסתר בנייד: תפריט צד במסך צר גוזל את רוב הרוחב.
                    שם הקטגוריות מופיעות ככותרות בזרימה ממילא. */}
                <nav className="hidden w-52 flex-shrink-0 lg:sticky lg:top-[136px] lg:block">
                  <p className="mb-2 px-3 text-sm font-semibold text-[#141210]/45">קטגוריות</p>
                  <ul className="flex flex-col gap-0.5">
                    {groups.map(([category, items]) => {
                      // הנקודה בגוון הקטגוריה — מקשרת בין התפריט למדף
                      const cc = categoryColor(category)
                      return (
                      <li key={category}>
                        <button
                          onClick={() => document.getElementById(catId(category))
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-right text-base text-[#141210]/70 transition hover:bg-white hover:text-[#141210]"
                        >
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                            style={{ background: cc.main }}
                          />
                          <span className="min-w-0 flex-1 truncate">{category}</span>
                          <span className="flex-shrink-0 text-sm tabular-nums text-[#141210]/35">
                            {items.length}
                          </span>
                        </button>
                      </li>
                      )
                    })}
                  </ul>
                </nav>

                <div className="min-w-0 flex-1">
                {groups.map(([category, items]) => {
                  const cc = categoryColor(category)
                  return (
                  <section
                    key={category}
                    id={catId(category)}
                    // ⚠️ scroll-mt: בלעדיו הכותרת נחתכת מאחורי הגוש
                    // הדביק אחרי קפיצה מהתפריט.
                    className="mb-12 scroll-mt-[150px]"
                  >
                    {/* 🔴 הקו והכותרת בגוון הקטגוריה: בגלילה ארוכה
                        הקונה יודע באיזה מדף הוא נמצא בלי לקרוא. */}
                    <div
                      className="mb-5 flex items-center gap-3 border-b-2 pb-2.5"
                      style={{ borderColor: cc.main }}
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ background: cc.main }}
                      />
                      <h2 className="text-[22px] font-extrabold tracking-[-0.02em]" style={{ color: cc.main }}>
                        {category}
                      </h2>
                      <span
                        className="ms-auto flex-shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold tabular-nums"
                        style={{ color: cc.main, background: cc.soft }}
                      >
                        {items.length} {items.length === 1 ? 'ספר' : 'ספרים'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
                      {items.map(b => (
                        <BookCard
                          key={b.id}
                          book={b}
                          inCart={cart.get(b.id) ?? 0}
                          justAdded={justAdded === b.id}
                          onAdd={el => add(b, el)}
                          onSetQty={q => setQty(b.id, q)}
                        />
                      ))}
                    </div>
                  </section>
                  )
                })}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-5 gap-y-7 pb-16 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map(b => (
                  <BookCard
                    key={b.id}
                    book={b}
                    inCart={cart.get(b.id) ?? 0}
                    justAdded={justAdded === b.id}
                    onAdd={el => add(b, el)}
                    onSetQty={q => setQty(b.id, q)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* ── סרגל תחתון בנייד — מעבר לתשלום ── */}
      {bookCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#141210]/10 bg-white p-4 shadow-[0_-4px_16px_rgba(20,18,16,0.08)] lg:hidden">
          <button
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between rounded-xl bg-[#6B2737] px-5 py-3.5 text-lg font-semibold text-white"
          >
            <span className="flex items-center gap-2"><ShoppingBag size={20} /> {bookCount} ספרים</span>
            <span>{fmtAgorot(itemsTotal)}</span>
          </button>
        </div>
      )}

      {/* ── הודעת "נוסף לעגלה" ──
          ⚠️ מתחת לסרגל הדביק ולא מעליו, כדי לא להסתיר את החיפוש. */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-5">
          <div className="flex max-w-sm items-center gap-2.5 rounded-xl bg-[#2D5016] px-5 py-3 text-white shadow-lg animate-[fadeInDown_0.2s_ease-out]">
            <Check size={19} strokeWidth={3} className="flex-shrink-0" />
            <span className="truncate text-base font-medium">{toast} נוסף לעגלה</span>
          </div>
        </div>
      )}

      {/* ── הספר "טס" לעגלה ──
          ⚠️ pointer-events-none: האנימציה חוצה את הדף ואסור שתחסום
          לחיצה על כרטיס אחר באמצע. */}
      {flight && <FlyToCart key={flight.id} from={flight.from} toRef={cartBtnRef} />}

      {cartOpen && (
        <CartPanel
          lines={lines} cities={cities} tiers={tiers}
          previewToken={previewToken} pickup={pickup}
          onClose={() => setCartOpen(false)} onSetQty={setQty}
        />
      )}
    </div>
  )
}

/**
 * גוש קטן שנע מהכרטיס אל כפתור העגלה.
 *
 * ⚠️ היעד נמדד בתוך האפקט ולא בגוף הרינדור: קריאת ref בזמן רינדור
 * אינה מובטחת — ה-DOM עשוי טרם להתייצב, והמיקום יוצא שגוי.
 *
 * ⚠️ requestAnimationFrame לפני שינוי המצב: הגדרת מיקום ההתחלה והסיום
 * באותו פריים מדלגת על המעבר לגמרי (הדפדפן רואה רק את הערך הסופי).
 */
function FlyToCart({ from, toRef }: {
  from: DOMRect
  toRef: React.RefObject<HTMLButtonElement | null>
}) {
  const [to, setTo] = useState<DOMRect | null>(null)
  const [arrived, setArrived] = useState(false)

  useEffect(() => {
    const rect = toRef.current?.getBoundingClientRect()
    if (!rect) return
    setTo(rect)
    const raf = requestAnimationFrame(() => setArrived(true))
    return () => cancelAnimationFrame(raf)
  }, [toRef])

  if (!to) return null
  const style: React.CSSProperties = arrived
    ? { top: to.top + to.height / 2, left: to.left + to.width / 2, opacity: 0, transform: 'scale(0.3)' }
    : { top: from.top + from.height / 2, left: from.left + from.width / 2, opacity: 1, transform: 'scale(1)' }

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 -ml-5 -mt-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#6B2737] text-white transition-all duration-[600ms] ease-in-out"
      style={style}
    >
      <ShoppingBag size={18} />
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
  onAdd: (el: HTMLElement | null) => void; onSetQty: (q: number) => void
}) {
  const out = !book.in_stock
  const img = bookImageUrl(book.image_path)
  const btnRef = useRef<HTMLButtonElement>(null)
  // הגוון של הקטגוריה — רץ דרך המק"ט, תג הכרכים וכפתור ההוספה.
  const c = categoryColor(book.description)

  // ⚠️ המחבר וההוצאה זהים ברוב הקטלוג ("מכון החתם סופר · מכון החתם
  // סופר"), כי הייבוא מהאקסל מילא את שניהם מאותה עמודה. מציגים ערך
  // אחד כשהם זהים — הכפילות נראתה כתקלה בנתונים, וזו בדיוק מה שהיא.
  const credit = book.author && book.publisher && book.author.trim() === book.publisher.trim()
    ? book.author
    : [book.author, book.publisher].filter(Boolean).join(' · ')

  return (
    // ⚠️ מעוגל בכל הצדדים ובלי שדרה חותכת בצד: השדרה גזרה פינה אחת
    // ישרה והכרטיס נראה חתוך ולא מעוצב.
    <article
      className="group relative flex flex-col overflow-hidden rounded-[20px] border border-[#141210]/[0.09] bg-white shadow-[0_2px_4px_-2px_rgba(23,19,16,0.13),0_10px_24px_-14px_rgba(23,19,16,0.13)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-none"
      style={{ ['--c' as string]: c.main, ['--c-soft' as string]: c.soft }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${c.main}52` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '' }}
    >
      {/* ── הכריכה ──
          ⚠️ 3:4 ולא 4:3: ספרי קודש מצולמים לגובה, והמסגרת הרחבה
          הקטינה אותם לרצועה באמצע הכרטיס. */}
      <div
        className="relative aspect-[3/4] w-full overflow-hidden"
        style={{ background: `radial-gradient(120% 90% at 50% 0%, ${c.soft}, transparent 72%), #EFEAE0` }}
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={book.title}
            loading="lazy"
            // ⚠️ contain ולא cover: כריכת ספר אסור שתיחתך — הכותרת
            // יושבת בדרך כלל למעלה, וחיתוך מוחק אותה.
            className={`h-full w-full object-contain p-3.5 drop-shadow-[0_6px_12px_rgba(0,0,0,0.17)] transition-transform duration-[250ms] motion-reduce:transition-none ${
              out ? '' : 'group-hover:scale-[1.035] motion-reduce:group-hover:scale-100'
            }`}
          />
        ) : (
          <NoCover title={book.title} />
        )}

        {/* 🔴 המק"ט אופקי ולא לאורך השדרה: ספרות מסובבות קשות לקריאה,
            והקונה נאלץ להטות את הראש כדי להשוות מול הקטלוג המודפס. */}
        <span
          className="absolute end-3 top-3 rounded-full border bg-white/[0.86] px-2.5 py-0.5 text-[13px] font-bold tabular-nums tracking-wide backdrop-blur-sm"
          style={{ color: c.main, borderColor: `${c.main}42` }}
        >
          {book.sku}
        </span>

        {/* 🔴 "אזל" נחשף בריחוף מעל הכריכה ב-50% שקיפות: הכריכה נשארת
            מזוהה מאחורי השכבה, כך שהקונה רואה *איזה* ספר אזל ולא רק
            שמשהו אזל. בנייד אין ריחוף — התג התחתון נושא את המידע. */}
        {out && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid place-items-center bg-[#171310]/50 opacity-0 backdrop-blur-[1.5px] transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
          >
            <span className="text-[30px] font-black tracking-wide text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.45)]">
              אזל
            </span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h2 className="line-clamp-2 text-[19px] font-bold leading-snug tracking-[-0.012em] text-[#141210]">
          {book.title}
        </h2>

        {/* ⚠️ התיאור ירד מהכרטיס: השדה מחזיק את *הקטגוריה* ולא תיאור
            אמיתי (כך הגיע מהאקסל), והוא רק דחף את המחיר והכפתור למטה.
            הקטגוריה כבר מופיעה ככותרת המדף ובגוון הכרטיס. */}
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-[#141210]/45">
          {credit && <span className="min-w-0">{credit}</span>}
          {book.volumes > 1 && (
            <span
              className="flex-shrink-0 rounded-full px-2 py-px text-[13px] font-semibold"
              style={{ color: c.main, background: c.soft }}
            >
              {book.volumes} כרכים
            </span>
          )}
        </p>

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="text-[25px] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-[#141210]">
            {fmtAgorot(book.price_agorot)}
          </span>

          {out ? (
            <span className="rounded-full border border-dashed border-[#141210]/15 px-3.5 py-2 text-sm font-semibold text-[#141210]/40">
              אזל מהמלאי
            </span>
          ) : inCart > 0 ? (
            <div className="flex items-center rounded-full border-2" style={{ borderColor: c.main }}>
              <button onClick={() => onSetQty(inCart - 1)} aria-label="הפחתת כמות"
                className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-[var(--c-soft)]"
                style={{ color: c.main }}>
                <Minus size={19} />
              </button>
              <span className="min-w-[2rem] text-center text-lg font-bold tabular-nums" style={{ color: c.main }}>
                {inCart}
              </span>
              <button onClick={() => onSetQty(inCart + 1)} aria-label="הוספת כמות"
                className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-[var(--c-soft)]"
                style={{ color: c.main }}>
                <Plus size={19} />
              </button>
            </div>
          ) : (
            // ⚠️ הרגע היחיד של תנועה בדף: הכפתור עונה לפעולה של הקונה
            // ומראה בבירור שהספר נכנס.
            <button
              ref={btnRef}
              onClick={() => onAdd(btnRef.current)}
              className="flex min-h-[48px] flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] font-bold text-white transition-colors duration-200"
              style={{ background: justAdded ? '#2D5016' : c.main }}
            >
              {justAdded ? <><Check size={18} /> נוסף</> : 'הוספה'}
            </button>
          )}
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

function CartPanel({ lines, cities, tiers, previewToken, pickup, onClose, onSetQty }: {
  lines: CartLine[]; cities: PublicCity[]; tiers: PublicTier[]
  previewToken?: string | null
  pickup?: { available: boolean; message: string; ready_hours: number } | null
  onClose: () => void; onSetQty: (id: string, q: number) => void
}) {
  const [step, setStep] = useState<'cart' | 'details' | 'payment'>('cart')
  // ⚠️ ברירת המחדל משלוח גם כשהאיסוף פתוח: רוב ההזמנות הן משלוח,
  // והאיסוף הוא בחירה מודעת.
  const [method, setMethod] = useState<'pickup' | 'shipping'>('shipping')
  const [cityId, setCityId] = useState('')
  /** שדות שהמשתמש נגע בהם — שגיאה מוצגת רק אחרי נגיעה. */
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  /** נדלק בלחיצה על "לתשלום" — מציג את כל השגיאות בבת אחת. */
  const [showErrors, setShowErrors] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // ⚠️ שני מסלולים אפשריים מהשרת: אייפרם (payment) או redirect (ספק
  // ישן/מדומה) — ראו lib/payments/types.ts ChargeResult.
  const [payment, setPayment] = useState<{ transactionId: string; key: string } | null>(null)
  const [trackingToken, setTrackingToken] = useState('')

  const bookCount = lines.reduce((s, l) => s + l.quantity, 0)
  // 🔴 המשלוח לפי כרכים ולא לפי פריטים — זהה לחישוב בשרת
  // (validateCheckout). פער בין השניים מציג ללקוח מחיר אחד וגובה אחר.
  const volumeCount = totalVolumes(lines.map(l => ({ volumes: l.book.volumes, quantity: l.quantity })))
  const itemsTotal = lines.reduce((s, l) => s + l.book.price_agorot * l.quantity, 0)
  // 🔴 איסוף עצמי = 0 ולא null: null פירושו "אין מדרגה מתאימה" וחוסם
  // את ההזמנה, בעוד שבאיסוף פשוט אין דמי משלוח.
  // ⚠️ מחיר המשלוח מחושב תמיד, גם באיסוף: הוא מוצג על כפתור המשלוח
  // כדי שהקונה יראה מה הוא חוסך, ולכן אינו יכול להיות תלוי בבחירה.
  const shipQuote = shippingCost('shipping', volumeCount, tiers)
  // 🔴 איסוף עצמי = 0 ולא null: null פירושו "אין מדרגה מתאימה" וחוסם
  // את ההזמנה, בעוד שבאיסוף פשוט אין דמי משלוח.
  const ship = method === 'pickup' ? 0 : shipQuote
  const total = itemsTotal + (ship ?? 0)

  // ── ולידציה לכל שדה בנפרד ──
  //
  // 🔴 שגיאה *לכל שדה* ולא דגל אחד: "יש למלא את כל שדות החובה" אינו
  // אומר ללקוח מה בדיוק חסר, והוא נתקע בלי לדעת איפה.
  //
  // ⚠️ מוצגות רק אחרי נגיעה בשדה (touched) או אחרי לחיצה על "לתשלום" —
  // אחרת הטופס נפתח אדום כולו למי שעוד לא הקליד דבר.
  const nameRaw = form.name.trim()
  const phoneDigits = form.phone.replace(/\D/g, '')
  const emailBad = emailError(form.email)

  const fieldErrors: Record<string, string> = {}
  // ⚠️ עברית בלבד: שם עם ספרות הוא כמעט תמיד טעות הקלדה בשדה הלא נכון.
  if (!nameRaw) fieldErrors.name = 'יש להזין שם מלא'
  else if (nameRaw.length < 2) fieldErrors.name = 'השם קצר מדי'
  else if (!/^[֐-׿\s'"־-]+$/.test(nameRaw)) fieldErrors.name = 'יש להזין שם בעברית בלבד'

  if (!phoneDigits) fieldErrors.phone = 'יש להזין מספר טלפון'
  else if (phoneDigits.length < 9) fieldErrors.phone = 'מספר הטלפון קצר מדי'
  else if (phoneDigits.length > 10) fieldErrors.phone = 'מספר הטלפון ארוך מדי'
  else if (!/^0\d{8,9}$/.test(phoneDigits)) fieldErrors.phone = 'מספר טלפון לא תקין'

  if (!form.email.trim()) fieldErrors.email = 'יש להזין כתובת מייל'
  else if (emailBad) fieldErrors.email = 'נא הזינו כתובת מייל תקינה'

  // ⚠️ עיר וכתובת נדרשות רק במשלוח — באיסוף אין לאן לשלוח.
  if (method === 'shipping') {
    if (!cityId) fieldErrors.city = 'יש לבחור עיר'
    if (!form.address.trim()) fieldErrors.address = 'יש לבחור רחוב ומספר בית מהרשימה'
    if (ship === null) fieldErrors.shipping = 'לא הוגדר תעריף משלוח להזמנה זו'
  }

  const detailsOk = Object.keys(fieldErrors).length === 0
  /** האם להציג את השגיאה של שדה זה. */
  const errFor = (k: string) => (touched[k] || showErrors) ? fieldErrors[k] : undefined

  async function submit() {
    setError(''); setBusy(true)
    try {
      const res = await fetch('/api/yerid/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lines.map(l => ({ book_id: l.book.id, quantity: l.quantity })),
          delivery_method: method,
          // ⚠️ null באיסוף — ראו ההערה המקבילה בשרת.
          city_id: method === 'shipping' ? cityId : null,
          address_text: method === 'shipping' ? form.address : null,
          customer_name: form.name.trim(),
          customer_phone: form.phone.trim(),
          customer_email: cleanEmail(form.email),
          // ⚠️ רק בנתיב הנסתר: מאפשר הזמנת בדיקה לפני פתיחת היריד.
          preview_token: previewToken ?? undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'ההזמנה נכשלה'); return }
      // ⚠️ מנקים את העגלה רק אחרי שההזמנה נוצרה בהצלחה
      try { localStorage.removeItem(CART_KEY) } catch { /* לא קריטי */ }
      setTrackingToken(json.trackingToken ?? '')
      if (json.iframeTransaction) {
        // אייפרם: התורם משלם בתוך הדף, בלי לעזוב אותו.
        setPayment(json.iframeTransaction)
        setStep('payment')
      } else if (json.redirectUrl) {
        // ספק מבוסס redirect (למשל מדומה) — הלקוח עוזב לדף מתארח.
        window.location.href = json.redirectUrl
      } else {
        setError('פתיחת התשלום נכשלה')
      }
    } catch {
      setError('ההזמנה נכשלה. בדקו את החיבור ונסו שוב.')
    } finally {
      setBusy(false)
    }
  }

  return (
    // 🔴 חלונית ממורכזת ולא מגירה צדדית: העגלה היא הרגע שבו הקונה
    // מחליט, והיא צריכה לעמוד במרכז תשומת הלב.
    // ⚠️ max-h + flex-col: בטופס ארוך התוכן גולל בתוך החלונית ולא
    // דוחף את כפתור התשלום מחוץ למסך.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141210]/60 p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col bg-[#F5F0E6] shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#141210]/10 bg-white px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-[#12314F]">
              {step === 'cart' ? 'העגלה שלי' : step === 'details' ? 'פרטי ההזמנה' : 'תשלום'}
            </h2>
            {step === 'cart' && lines.length > 0 && (
              <p className="mt-0.5 text-sm text-[#141210]/50">
                {bookCount} {bookCount === 1 ? 'ספר' : 'ספרים'} · {volumeCount} כרכים
              </p>
            )}
          </div>
          {/* ⚠️ בשלב התשלום אין כפתור סגירה: ניתוק באמצע יוצר הזמנה
              תקועה (pending_payment) שהמלאי שלה משוריין 25 דקות. */}
          {step !== 'payment' && (
            <button onClick={onClose} aria-label="סגירה"
              className="rounded-lg p-2 text-[#141210]/40 transition hover:bg-[#141210]/5 hover:text-[#141210]">
              <X size={22} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'payment' && payment ? (
            <NedarimIframe
              transactionId={payment.transactionId}
              key_={payment.key}
              onSuccess={() => {
                window.location.href = trackingToken ? `/yerid/order/${trackingToken}` : '/yerid'
              }}
              onBack={() => { setPayment(null); setStep('details') }}
            />
          ) : step === 'cart' ? (
            !lines.length ? (
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <ShoppingBag size={44} className="text-[#141210]/15" />
                <p className="text-lg font-medium text-[#141210]/50">העגלה ריקה</p>
                <button onClick={onClose} className="text-base font-medium text-[#6B2737] underline underline-offset-4">
                  חזרה לקטלוג
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {lines.map(l => (
                  <li key={l.book.id} className="rounded-xl border border-[#141210]/8 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-[#12314F]">
                        {l.book.title}
                      </p>
                      <button onClick={() => onSetQty(l.book.id, 0)} aria-label="הסרה"
                        className="-mt-1 flex-shrink-0 rounded-lg p-1.5 text-[#141210]/30 transition hover:bg-[#6B2737]/10 hover:text-[#6B2737]">
                        <X size={17} />
                      </button>
                    </div>
                    <p className="mt-0.5 text-sm text-[#141210]/45">
                      {l.book.volumes > 1 ? `${l.book.volumes} כרכים · ` : ''}{fmtAgorot(l.book.price_agorot)} ליחידה
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center rounded-lg border border-[#141210]/15 bg-[#FAF7F0]">
                        <button onClick={() => onSetQty(l.book.id, l.quantity - 1)} aria-label="הפחתה"
                          className="flex h-9 w-9 items-center justify-center text-[#141210]/60 transition hover:text-[#6B2737]">
                          <Minus size={15} />
                        </button>
                        <span className="min-w-[2.25rem] text-center text-base font-bold tabular-nums">{l.quantity}</span>
                        <button onClick={() => onSetQty(l.book.id, l.quantity + 1)} aria-label="הוספה"
                          className="flex h-9 w-9 items-center justify-center text-[#141210]/60 transition hover:text-[#6B2737]">
                          <Plus size={15} />
                        </button>
                      </div>
                      <span className="text-lg font-bold tabular-nums text-[#6B2737]">
                        {fmtAgorot(l.book.price_agorot * l.quantity)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="flex flex-col gap-5">
              {/* ── אופן האספקה ──
                  ⚠️ האיסוף מוצג רק כשהוא פתוח בפועל (נקבע בשרת).
                  כשהוא סגור מוצגת הסיבה, כדי שלא ייראה כתקלה. */}
              <fieldset>
                <legend className="mb-2 text-lg font-semibold text-[#141210]">איך לקבל את הספרים?</legend>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setMethod('shipping')}
                    className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-right transition ${
                      method === 'shipping' ? 'border-[#6B2737] bg-white' : 'border-[#141210]/15 hover:border-[#141210]/30'
                    }`}
                  >
                    <Truck size={20} className="flex-shrink-0 text-[#12314F]" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[#12314F]">משלוח עד הבית</span>
                      <span className="block text-sm text-[#141210]/55">
                        {shipQuote === null
                          ? 'לא הוגדר תעריף משלוח'
                          : `${fmtAgorot(shipQuote)} · ${volumeCount} כרכים`}
                      </span>
                    </span>
                  </button>

                  {pickup?.available ? (
                    <button
                      type="button"
                      onClick={() => setMethod('pickup')}
                      className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-right transition ${
                        method === 'pickup' ? 'border-[#6B2737] bg-white' : 'border-[#141210]/15 hover:border-[#141210]/30'
                      }`}
                    >
                      <Package size={20} className="flex-shrink-0 text-[#2D5016]" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-[#2D5016]">איסוף עצמי מהיריד — ללא עלות</span>
                        <span className="block text-sm text-[#141210]/55">{pickup.message}</span>
                      </span>
                    </button>
                  ) : pickup ? (
                    <p className="rounded-xl bg-[#141210]/[0.04] px-4 py-3 text-sm text-[#141210]/50">
                      {pickup.message}
                    </p>
                  ) : null}
                </div>
              </fieldset>

              {/* ⚠️ שדות הכתובת מוצגים רק במשלוח: באיסוף אין לאן לשלוח,
                  והצגתם הייתה שדות חובה שאי אפשר למלא בהיגיון. */}
              {method === 'shipping' && (
                <>
                  <Field label="עיר" required error={errFor('city')} anchor="city">
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
                  {/* ⚠️ רחוב נבחר מהמאגר הרשמי (gov_streets) ולא מוקלד
                      חופשי — כדי שהשליח יקבל כתובת אמיתית ולא טעות הקלדה.
                      העיר עצמה כבר נבחרה למעלה מתוך הרשימה הסגורה. */}
                  <StreetPicker
                    city={cities.find(c => c.id === cityId)?.name ?? ''}
                    address={form.address}
                    onAddressChange={address => setForm(f => ({ ...f, address }))}
                    addressRequired
                    houseRequired
                    labelSize="sm"
                  />
                </>
              )}

              {/* ⚠️ עברית בלבד — הסינון בהקלדה ולא רק בוולידציה: ספרה
                  בשם היא כמעט תמיד הקלדה בשדה הלא נכון, ועדיף למנוע
                  אותה מאשר להתריע אחריה. */}
              <Field label="שם מלא" required error={errFor('name')} anchor="name">
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({
                    ...f, name: e.target.value.replace(/[^֐-׿\s'"־-]/g, ''),
                  }))}
                  onBlur={() => setTouched(t => ({ ...t, name: true }))}
                  className={INPUT}
                />
              </Field>

              {/* ⚠️ ספרות בלבד, עד 10: maxLength אינו חוסם הדבקה. */}
              <Field label="טלפון" required error={errFor('phone')} anchor="phone">
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({
                    ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10),
                  }))}
                  onBlur={() => setTouched(t => ({ ...t, phone: true }))}
                  inputMode="numeric" dir="ltr" className={INPUT}
                />
              </Field>

              {/* 🔴 האימייל חובה: הוא הדרך היחידה של הלקוח לקבל את קישור
                  המעקב. עד כה הוא היה אופציונלי, והזמנה בלי מייל נעלמה
                  מהלקוח ברגע שסגר את הלשונית. */}
              <Field label="אימייל" required error={errFor('email')} anchor="email">
                <input
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  onBlur={() => setTouched(t => ({ ...t, email: true }))}
                  inputMode="email" dir="ltr" className={INPUT}
                />
              </Field>

              {error && (
                <p className="rounded-md border-2 border-[#6B2737]/30 bg-[#6B2737]/5 px-4 py-3 text-base text-[#6B2737]">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {lines.length > 0 && step !== 'payment' && (
          <div className="border-t-2 border-[#141210]/10 bg-white px-5 py-4">
            {/* 🔴 המשלוח מוצג כבר בשלב העגלה ולא רק בטופס: לקוח שראה
                סכום אחד בעגלה וסכום גבוה יותר בתשלום חושב שהוטעה. */}
            <dl className="mb-3 flex flex-col gap-1.5 text-base">
              <div className="flex justify-between text-[#141210]/70">
                <dt>{bookCount} {bookCount === 1 ? 'ספר' : 'ספרים'}</dt>
                <dd className="tabular-nums">{fmtAgorot(itemsTotal)}</dd>
              </div>
              <div className="flex justify-between text-[#141210]/70">
                <dt>{method === 'pickup' ? 'איסוף עצמי מהיריד' : 'משלוח עד הבית'}</dt>
                <dd className="tabular-nums">
                  {ship === null ? '—' : ship === 0 ? 'ללא עלות' : fmtAgorot(ship)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-[#141210]/10 pt-2 text-xl font-bold text-[#141210]">
                <dt>סך הכול</dt>
                <dd className="tabular-nums text-[#6B2737]">{fmtAgorot(total)}</dd>
              </div>
            </dl>

            {step === 'cart' ? (
              <button onClick={() => setStep('details')}
                className="w-full rounded-xl bg-[#141210] py-4 text-lg font-semibold text-[#F5F0E6] transition hover:bg-[#6B2737]">
                המשך להזמנה
              </button>
            ) : (
              <>
                <div className="flex gap-2">
                  <button onClick={() => setStep('cart')}
                    className="rounded-xl border-2 border-[#141210]/15 px-5 py-4 text-lg font-medium text-[#141210]/70 transition hover:border-[#141210]/30">
                    חזרה
                  </button>
                  {/* 🔴 הכפתור *לחיץ תמיד*: כפתור מושבת אינו אומר
                      ללקוח מה חסר, והוא נתקע מול מסך שלא מגיב. לחיצה
                      עם שדה שגוי מדליקה את כל השגיאות ומקפיצה לשדה
                      הראשון שבעייתי. */}
                  <button
                    onClick={() => {
                      if (!detailsOk) {
                        setShowErrors(true)
                        // ⚠️ גלילה לשדה הבעייתי: בטופס ארוך השגיאה
                        // עשויה להיות מחוץ למסך, והלקוח לא יראה אותה.
                        const first = ['name', 'phone', 'email', 'city', 'address']
                          .find(k => fieldErrors[k])
                        if (first) {
                          document.querySelector(`[data-field="${first}"]`)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }
                        return
                      }
                      void submit()
                    }}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#6B2737] py-4 text-lg font-semibold text-[#F5F0E6] transition hover:bg-[#141210] disabled:opacity-60">
                    {busy && <Loader2 size={18} className="animate-spin" />}
                    {busy ? 'מעביר לתשלום…' : `לתשלום ${fmtAgorot(total)}`}
                  </button>
                </div>
                {showErrors && !detailsOk && !busy && (
                  <p className="mt-2 text-center text-sm font-medium text-[#6B2737]">
                    {Object.values(fieldErrors)[0]}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const INPUT = 'w-full rounded-md border-2 border-[#141210]/15 bg-white px-4 py-3.5 text-lg outline-none transition focus:border-[#B8860B]'

function Field({ label, required, hint, error, anchor, children }: {
  label: string; required?: boolean; hint?: string
  /** מזהה לגלילה אוטומטית מכפתור התשלום. */
  anchor?: string
  /** שגיאה לשדה זה. ⚠️ מחליפה את ה-hint — שתי שורות מתחת לשדה מבלבלות. */
  error?: string
  children: React.ReactNode
}) {
  return (
    <label data-field={anchor} className="flex flex-col gap-1.5">
      <span className="text-lg font-semibold text-[#141210]">
        {label}{required && <span className="text-[#6B2737]"> *</span>}
      </span>
      {children}
      {error
        ? <span className="text-sm font-medium text-[#6B2737]">{error}</span>
        : hint && <span className="text-sm text-[#141210]/50">{hint}</span>}
    </label>
  )
}
