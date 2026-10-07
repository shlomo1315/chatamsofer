'use client'
import { useMemo, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronLeft, Printer } from 'lucide-react'
import { NAV_KEY, parseNavList } from '@/lib/bookFairOrderHandoff'

// ─────────────────────────────────────────────────────────────────────────────
// "הזמנה הבאה / הקודמת" (בקשת המשתמש 07.10).
//
// 🔴 הסדר הוא של הטבלה כפי שהמשתמש השאיר אותה — אחרי כרטיס, חיפוש, סינון
// ומיון (נשמר ב-sessionStorage במסך ההזמנות). כך עוברים ברצף על "ממתין
// לאימות שם" ולא קופצים להזמנות שכבר טופלו.
//
// ⚠️ כשההזמנה אינה ברשימה (קישור ישיר, לשונית חדשה) — חזרה לסדר
// הכרונולוגי שהשרת חישב.
// ─────────────────────────────────────────────────────────────────────────────

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}

function readNav(): string | null {
  try { return sessionStorage.getItem(NAV_KEY) } catch { return null }
}

const BTN = 'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50'
const OFF = 'inline-flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-sm text-slate-300'

export default function OrderNav({ id, fallbackPrev, fallbackNext }: {
  id: string
  /** ההזמנה החדשה יותר בסדר הכרונולוגי. */
  fallbackPrev: string | null
  /** ההזמנה הישנה יותר. */
  fallbackNext: string | null
}) {
  // ⚠️ useSyncExternalStore ולא useEffect+setState — מחרוזת יציבה, בלי
  // סיכון ללולאת רינדור, ובשרת null (ואז הסדר הכרונולוגי).
  const raw = useSyncExternalStore(subscribe, readNav, () => null)
  const list = useMemo(() => parseNavList(raw), [raw])

  const pos = list ? list.indexOf(id) : -1
  const inList = pos >= 0
  const prev = inList ? (list![pos - 1] ?? null) : fallbackPrev
  const next = inList ? (list![pos + 1] ?? null) : fallbackNext

  return (
    <div className="flex flex-wrap items-center gap-2">
      {prev
        ? <Link href={`/admin/book-fair/orders/${prev}`} className={BTN}><ChevronRight size={15} /> הקודמת</Link>
        : <span className={OFF}><ChevronRight size={15} /> הקודמת</span>}
      {inList && (
        <span className="text-xs tabular-nums text-slate-500">{pos + 1} מתוך {list!.length}</span>
      )}
      {next
        ? <Link href={`/admin/book-fair/orders/${next}`} className={BTN}>הבאה <ChevronLeft size={15} /></Link>
        : <span className={OFF}>הבאה <ChevronLeft size={15} /></span>}
      <a
        href={`/admin/book-fair/orders/print?mode=notes&id=${id}`}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700"
      >
        <Printer size={14} /> תעודת משלוח
      </a>
    </div>
  )
}
