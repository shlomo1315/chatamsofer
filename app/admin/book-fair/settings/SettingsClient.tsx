'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, AlertTriangle, MapPin, Truck, Power, CreditCard, Phone } from 'lucide-react'
import type { BookFairCity } from '@/types/bookFair'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCan } from '@/components/StaffPermissions'
import PaymentSettings from './PaymentSettings'
import SellerPassword from './SellerPassword'
import AgreedRates from './AgreedRates'
import OfficeContact from './OfficeContact'
import DashboardAccess from './DashboardAccess'
import RecordingRescue from './RecordingRescue'
import PhoneMessages from '../phone/PhoneMessages'
import BookAudio from '../phone/BookAudio'

// הגדרות היריד: מתג פתיחה, ערי משלוח, תעריפים, תשלום ושלוחה טלפונית.
//
// 🔴 הכול בטאבים ולא בגלילה אחת ארוכה: המסך החזיק שישה מקטעים זה
// מתחת לזה, ונוסחי השלוחה הטלפונית ישבו במסך נפרד שלא הופיע בסרגל
// הניווט כלל — אי אפשר היה למצוא אותם.

const TABS = [
  { id: 'general', label: 'כללי', icon: Power },
  { id: 'shipping', label: 'משלוח ותעריפים', icon: Truck },
  { id: 'payment', label: 'תשלום ודוכן', icon: CreditCard },
  { id: 'phone', label: 'שלוחה טלפונית', icon: Phone },
] as const

type TabId = typeof TABS[number]['id']


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

export default function SettingsClient({ cities, open, openAt, mockPay }: {
  cities: BookFairCity[]; open: boolean
  /** מועד הפתיחה האוטומטית (ISO), או null אם לא נקבע. */
  openAt: string | null
  /** הסליקה המחוברת מדומה — פתיחת היריד תתקבל רק אחרי אישור מפורש. */
  mockPay: boolean
}) {
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirm()
  const canEdit = useCan('book_fair', 'edit')
  const [tab, setTab] = useState<TabId>('general')
  const [phoneTab, setPhoneTab] = useState<'messages' | 'books'>('messages')

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

  return (
    <div className="flex flex-col gap-5">
      {confirmDialog}

      {/* ── טאבים ── */}
      <nav className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {/* ── מתג פתיחה ── */}
      <section hidden={tab !== 'general'} className={`rounded-2xl border-2 p-5 ${
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

      {/* ── תשלום ודוכן ── */}
      <div hidden={tab !== 'payment'} className="flex flex-col gap-5">
        <PaymentSettings />
        <SellerPassword />
        <OfficeContact canEdit={canEdit} />
        <DashboardAccess canEdit={canEdit} />
        <RecordingRescue canEdit={canEdit} />
      </div>

      {/* ── השלוחה הטלפונית ──
          🔴 כאן ולא במסך נפרד: /admin/book-fair/phone לא הופיע בסרגל
          הניווט, ואי אפשר היה להגיע אליו בלי לדעת את הכתובת. */}
      {tab === 'phone' && (
        <div className="flex flex-col gap-5">
          {/* ⚠️ שני חלקים נפרדים: נוסחי המערכת (67 הודעות קבועות)
              והקלטות התוכן (111 ספרים + 9 קטגוריות). שונים במהותם —
              אלה נערכים פעם אחת, ואלה משתנים עם הקטלוג. */}
          <nav className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {([['messages', 'נוסחי המערכת'], ['books', 'הקלטות ספרים וקטגוריות']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPhoneTab(id)}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  phoneTab === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          {phoneTab === 'messages' ? <PhoneMessages /> : <BookAudio />}
        </div>
      )}

      {/* ── ערי משלוח ── */}
      <div hidden={tab !== 'shipping'}>
        <AgreedRates canEdit={canEdit} />
      </div>

      <section hidden={tab !== 'shipping'} className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
          <MapPin size={17} /> ערי משלוח
        </h2>
        <p className="mb-1 text-sm text-slate-500">
          הלקוח בוחר מתוך הרשימה. עיר שאינה כאן — לא ניתן להזמין אליה משלוח.
        </p>
        <p className="mb-4 text-xs text-slate-400">
          הקוד בטלפון הוא הספרה שהלקוח מקיש במוקד (ירושלים 1, בני ברק 2…).
          עדיף רצף מ-1 בלי דילוגים — קל יותר להקראה.
        </p>

        {/* ⚠️ פער ברצף אינו שגיאה במסד (הייחודיות נשמרת), אבל בטלפון
            הוא מבלבל: המוקד מקריא "1, 2, 4" והמאזין חושב שפספס. */}
        {(() => {
          const codes = cities
            .map(c => c.phone_code)
            .filter((n): n is number => typeof n === 'number')
            .sort((a, b) => a - b)
          if (codes.length < 2) return null
          const gaps: number[] = []
          for (let n = 1; n < codes[codes.length - 1]; n++) {
            if (!codes.includes(n)) gaps.push(n)
          }
          if (!gaps.length) return null
          return (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              הקודים בטלפון אינם רצופים — חסרים {gaps.join(', ')}. המערכת תעבוד,
              אך ההקראה במוקד תישמע כאילו דולגה עיר.
            </p>
          )
        })()}

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

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
    </div>
  )
}
