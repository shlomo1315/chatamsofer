'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, Check, AlertTriangle, MapPin, Truck, Power } from 'lucide-react'
import type { BookFairCity, BookFairShippingTier } from '@/types/bookFair'
import { fmtAgorot, agorotToShekels } from '@/lib/bookFairPricing'
import { validateTiers, resolveShippingTier, tierLabel, type TierInput } from '@/lib/bookFairShipping'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCan } from '@/components/StaffPermissions'
import PaymentSettings from './PaymentSettings'

// הגדרות היריד: מתג פתיחה, ערי משלוח, ומדרגות תעריף.

type TierRow = { min_books: string; max_books: string; price: string; step_volumes: string; step_price: string }

/**
 * ISO → הערך שתגית datetime-local מצפה לו (YYYY-MM-DDTHH:mm), בשעון מקומי.
 *
 * ⚠️ לא slice על ה-ISO: זה היה מציג UTC ומזיז את השעה בשעתיים-שלוש,
 * והמנהל היה קובע 22:00 ומקבל פתיחה ב-19:00.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function SettingsClient({ cities, tiers, open, openAt, mockPay }: {
  cities: BookFairCity[]; tiers: BookFairShippingTier[]; open: boolean
  /** מועד הפתיחה האוטומטית (ISO), או null אם לא נקבע. */
  openAt: string | null
  /** הסליקה המחוברת מדומה — פתיחת היריד תתקבל רק אחרי אישור מפורש. */
  mockPay: boolean
}) {
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirm()
  const canEdit = useCan('book_fair', 'edit')

  const [isOpen, setIsOpen] = useState(open)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  // ── מועד פתיחה אוטומטית ──
  const [schedule, setSchedule] = useState(() => toLocalInput(openAt))

  async function saveSchedule() {
    // ⚠️ נשלח כ-ISO מלא ולא כערך השדה: datetime-local מחזיר מחרוזת
    // בלי אזור זמן, והשרת היה מפרש אותה כ-UTC.
    const iso = schedule.trim() ? new Date(schedule).toISOString() : ''
    await call('/api/admin/book-fair/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openAt: iso }),
    }, 'schedule')
  }

  // ── ערים ──
  const [newCity, setNewCity] = useState({ name: '', phone_code: '' })

  // ── מדרגות ──
  // ⚠️ אתחול עצל: המרה מאגורות לשקלים בכל רינדור הייתה מאבדת את מה
  // שהמשתמש הקליד באמצע העריכה.
  const [rows, setRows] = useState<TierRow[]>(() =>
    tiers.length
      ? tiers.map(t => ({
          min_books: String(t.min_books),
          max_books: t.max_books === null ? '' : String(t.max_books),
          price: String(agorotToShekels(t.price_agorot)),
          step_volumes: t.step_volumes == null ? '' : String(t.step_volumes),
          step_price: t.step_agorot == null ? '' : String(agorotToShekels(t.step_agorot)),
        }))
      : [{ min_books: '1', max_books: '', price: '', step_volumes: '', step_price: '' }]
  )

  // ולידציה חיה — המשתמש רואה את הבעיה תוך כדי הקלדה ולא אחרי שמירה
  const parsed: TierInput[] = rows.map(r => ({
    min_books: Number(r.min_books),
    max_books: r.max_books.trim() === '' ? null : Number(r.max_books),
    price_agorot: Math.round((Number(r.price) || 0) * 100),
    step_volumes: r.step_volumes.trim() === '' ? null : Number(r.step_volumes),
    step_agorot: r.step_price.trim() === '' ? null : Math.round((Number(r.step_price) || 0) * 100),
  }))
  const check = validateTiers(parsed)

  async function call(url: string, init: RequestInit, tag: string) {
    setBusy(tag); setError('')
    try {
      const res = await fetch(url, init)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'הפעולה נכשלה'); return false }
      router.refresh()
      return true
    } catch {
      setError('הפעולה נכשלה — בדקו את החיבור')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function toggleOpen() {
    const next = !isOpen

    // 🔴 פתיחה כשהסליקה מדומה = חנות שמוכרת בלי לגבות. המתג היה
    // לחיצה אחת בלי שום שאלה, והתקלה מתגלה רק כשמישהו משווה הזמנות
    // לבנק. הסגירה, לעומת זאת, לעולם אינה נשאלת — עצירה היא תמיד
    // הצד הבטוח.
    if (next && mockPay) {
      const go = await confirm({
        title: 'הסליקה במצב בדיקה',
        message: 'ספק הסליקה המחובר מדומה: כל הזמנה תסומן כ״שולמה״ ותוריד מהמלאי ' +
                 'בלי שייגבה תשלום. לפתוח בכל זאת?',
        confirmLabel: 'פתח בכל זאת', danger: true,
      })
      if (!go) return
    }

    const ok = await call('/api/admin/book-fair/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open: next }),
    }, 'gate')
    if (ok) setIsOpen(next)
  }

  async function addCity() {
    if (!newCity.name.trim()) return
    const ok = await call('/api/admin/book-fair/cities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCity),
    }, 'add-city')
    if (ok) setNewCity({ name: '', phone_code: '' })
  }

  async function delCity(c: BookFairCity) {
    // ⚠️ שואלים כמה הזמנות ייפגעו *לפני* האזהרה, כדי שההזהרה תהיה
    // מספרית ולא מעורפלת.
    let count = 0
    try {
      const res = await fetch(`/api/admin/book-fair/cities?countFor=${c.id}`)
      count = (await res.json())?.orders ?? 0
    } catch { /* נמשיך עם אזהרה כללית */ }

    const ok = await confirm({
      title: `מחיקת ${c.name}`,
      message: count > 0
        ? `ל-${count} הזמנות קיימות משויכת העיר הזו. אחרי המחיקה הן יופיעו ללא עיר, ולא ניתן יהיה לשחזר. להמשיך?`
        : `למחוק את ${c.name} מרשימת ערי המשלוח?`,
      confirmLabel: 'מחק', danger: true,
    })
    if (!ok) return
    await call(`/api/admin/book-fair/cities?id=${c.id}`, { method: 'DELETE' }, `del-${c.id}`)
  }

  async function saveTiers() {
    if (!check.ok) return
    await call('/api/admin/book-fair/shipping-tiers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tiers: rows.map(r => ({
          min_books: Number(r.min_books),
          max_books: r.max_books.trim() === '' ? null : Number(r.max_books),
          price: r.price,
          step_volumes: r.step_volumes.trim() === '' ? null : Number(r.step_volumes),
          step_price: r.step_price,
        })),
      }),
    }, 'tiers')
  }

  const setRow = (i: number, k: keyof TierRow, v: string) =>
    setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r))

  return (
    <div className="flex flex-col gap-5">
      {confirmDialog}

      {/* ── מתג פתיחה ── */}
      <section className={`rounded-2xl border-2 p-5 ${
        isOpen ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Power size={20} className={isOpen ? 'mt-0.5 text-emerald-600' : 'mt-0.5 text-slate-400'} />
            <div>
              <h2 className="font-semibold text-slate-900">
                {isOpen ? 'היריד פתוח להזמנות' : 'היריד סגור'}
              </h2>
              <p className="text-sm text-slate-600">
                {isOpen
                  ? 'לקוחות יכולים להזמין באתר ובמערכת הטלפונית.'
                  : 'האתר מציג הודעת סגירה, והזמנות חדשות נדחות.'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleOpen}
            disabled={!canEdit || !!busy}
            className={`rounded-xl px-5 py-2.5 text-sm font-medium text-white transition disabled:opacity-50 ${
              isOpen ? 'bg-slate-600 hover:bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {busy === 'gate' ? <Loader2 size={15} className="animate-spin" /> : isOpen ? 'סגירת היריד' : 'פתיחת היריד'}
          </button>
        </div>

        {/* ── פתיחה אוטומטית ──
            🔴 בלי זה מישהו צריך להיות ער בשעה היעודה וללחוץ, וכל מי
            שנרשם לתזכורת מקבל הבטחה שלא קוימה.
            ⚠️ מוצג רק כשהיריד סגור — אחרי הפתיחה זה כבר לא רלוונטי. */}
        {!isOpen && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
            <span className="text-sm font-medium text-slate-700">פתיחה אוטומטית</span>
            <p className="text-xs text-slate-500">
              היריד ייפתח מעצמו במועד הזה, ותישלח תזכורת לכל מי שנרשם בדף ההמתנה.
              השאירו ריק כדי לפתוח ידנית בלבד.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
                disabled={!canEdit}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                onClick={saveSchedule}
                disabled={!canEdit || !!busy}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                {busy === 'schedule' ? <Loader2 size={14} className="animate-spin" /> : 'שמירת המועד'}
              </button>
            </div>
          </div>
        )}

        {/* ⚠️ מוצג ליד המתג ולא רק בלוח הבקרה: זה המקום שבו מקבלים את
            ההחלטה, ומי שמגיע לכאן ישירות לא ראה את הבאנר שם. */}
        {mockPay && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              <strong>הסליקה במצב בדיקה</strong> — הזמנות יסומנו כ״שולמו״ ויורידו
              מהמלאי בלי שייגבה תשלום.
            </span>
          </p>
        )}
      </section>

      {/* ── ספק הסליקה ── */}
      <PaymentSettings />

      {/* ── ערי משלוח ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
          <MapPin size={17} /> ערי משלוח
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          הלקוח בוחר מתוך הרשימה. עיר שאינה כאן — לא ניתן להזמין אליה משלוח.
        </p>

        {cities.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {cities.map(c => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-900">{c.name}</span>
                  {c.phone_code != null && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                      קוד {c.phone_code}
                    </span>
                  )}
                  {!c.is_active && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">מוסתר</span>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={() => delCity(c)}
                    disabled={!!busy}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    title="מחיקה"
                  >
                    {busy === `del-${c.id}` ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-1 min-w-[180px] flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">שם העיר</span>
              <input
                value={newCity.name}
                onChange={e => setNewCity(c => ({ ...c, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addCity() }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
              />
            </label>
            <label className="flex w-32 flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">קוד בטלפון</span>
              <input
                value={newCity.phone_code}
                onChange={e => setNewCity(c => ({ ...c, phone_code: e.target.value }))}
                dir="ltr" inputMode="numeric"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
              />
            </label>
            <button
              onClick={addCity}
              disabled={!!busy || !newCity.name.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-40"
            >
              {busy === 'add-city' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              הוספה
            </button>
          </div>
        )}
      </section>

      {/* ── מדרגות משלוח ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
          <Truck size={17} /> תעריף משלוח
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          המחיר נקבע לפי מספר ה<strong>כרכים</strong> בהזמנה — סדרה בת 6 כרכים נספרת כ-6. איסוף עצמי תמיד ללא עלות.
        </p>

        <div className="mb-3 flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="flex w-24 flex-col gap-1">
                <span className="text-xs text-slate-500">מ-</span>
                <input value={r.min_books} onChange={e => setRow(i, 'min_books', e.target.value)}
                  disabled={!canEdit} dir="ltr" inputMode="numeric"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label className="flex w-24 flex-col gap-1">
                <span className="text-xs text-slate-500">עד</span>
                <input value={r.max_books} onChange={e => setRow(i, 'max_books', e.target.value)}
                  disabled={!canEdit} dir="ltr" inputMode="numeric" placeholder="ומעלה"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label className="flex w-28 flex-col gap-1">
                <span className="text-xs text-slate-500">מחיר ₪</span>
                <input value={r.price} onChange={e => setRow(i, 'price', e.target.value)}
                  disabled={!canEdit} dir="ltr" inputMode="decimal"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
              {/* ⚠️ תוספת מדורגת — רק במדרגה הפתוחה ("ומעלה"). בלעדיה
                  הזמנה של 90 כרכים משלמת בדיוק כמו הזמנה של 14. */}
              {r.max_books.trim() === '' && (
                <>
                  <span className="pb-2 text-sm text-slate-400">+</span>
                  <label className="flex w-28 flex-col gap-1">
                    <span className="text-xs text-slate-500">₪ לכל</span>
                    <input value={r.step_price} onChange={e => setRow(i, 'step_price', e.target.value)}
                      disabled={!canEdit} dir="ltr" inputMode="decimal" placeholder="ללא"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <label className="flex w-24 flex-col gap-1">
                    <span className="text-xs text-slate-500">כרכים</span>
                    <input value={r.step_volumes} onChange={e => setRow(i, 'step_volumes', e.target.value)}
                      disabled={!canEdit} dir="ltr" inputMode="numeric" placeholder="ללא"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                </>
              )}
              <span className="pb-2 text-sm text-slate-400">{tierLabel(parsed[i])} כרכים</span>
              {canEdit && rows.length > 1 && (
                <button
                  onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                  className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="הסרת מדרגה"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>

        {canEdit && (
          <button
            onClick={() => setRows(rs => [...rs, { min_books: '', max_books: '', price: '', step_volumes: '', step_price: '' }])}
            className="mb-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Plus size={14} /> מדרגה נוספת
          </button>
        )}

        {/* 🔴 ולידציה חיה: פער בטבלה אינו מייצר שגיאה — הוא פשוט מונע
            מהלקוח להשלים הזמנה, בלי שום הסבר על המסך שלו. */}
        {!check.ok ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-red-900">
              <AlertTriangle size={15} /> יש לתקן לפני שמירה
            </p>
            <ul className="text-sm text-red-800">
              {check.errors.map((e, i) => <li key={i}>· {e}</li>)}
            </ul>
          </div>
        ) : (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-emerald-900">
              <Check size={15} /> תצוגה מקדימה
            </p>
            <div className="flex flex-wrap gap-2 text-sm text-emerald-800">
              {[1, 3, 5, 10, 25].map(n => {
                const p = resolveShippingTier(n, parsed)
                return (
                  <span key={n} className="rounded-lg bg-white/70 px-2.5 py-1">
                    {n} ספרים → {p === null ? '—' : p === 0 ? 'חינם' : fmtAgorot(p)}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {canEdit && (
          <button
            onClick={saveTiers}
            disabled={!!busy || !check.ok}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-40"
          >
            {busy === 'tiers' ? <Loader2 size={15} className="animate-spin" /> : 'שמירת התעריפים'}
          </button>
        )}
      </section>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
    </div>
  )
}
