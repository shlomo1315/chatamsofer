'use client'
import { Loader2 } from 'lucide-react'
import { useLiveData } from '@/components/bookFair/useLiveData'
import {
  CARD_STATUS_KEYS, CARD_STATUS_LABELS, type CardStatusKey, type FoodCardSummary,
} from '@/lib/maternityFoodCards'

// טאב "כרטיסי מזון": סיכום כרטיסי המזון של מחלקת היולדות, מפולח לפי בית החלמה,
// סטטוס וחודש. מספרים מסוכמים בלבד (בלי פרטי יולדות), מהמסד ולא מנדרים.

type Payload = FoodCardSummary & { at: string }

const COLORS: Record<CardStatusKey, string> = {
  loaded: '#2E8B57', pending: '#D9A441', failed: '#C0392B', unloaded: '#5B74B8', idle: '#B9B09A',
}
const money = (n: number) => `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`
const num = (n: number) => n.toLocaleString('he-IL')
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-')
  return `${mo}/${y.slice(2)}`
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

function Ring({ parts, total }: { parts: { color: string; value: number }[]; total: number }) {
  const R = 52
  const C = 2 * Math.PI * R
  let acc = 0
  return (
    <svg viewBox="0 0 140 140" className="h-44 w-44" role="img" aria-label="פילוח סטטוס כרטיסים">
      <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="16" />
      {total > 0 && parts.map((p, i) => {
        const len = (p.value / total) * C
        const el = (
          <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="16"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />
        )
        acc += len
        return el
      })}
      <text x="70" y="68" textAnchor="middle" className="fill-[#F4F1EA] text-[26px] font-bold">{num(total)}</text>
      <text x="70" y="88" textAnchor="middle" className="fill-[#C9CFDB] text-[11px]">יולדות</text>
    </svg>
  )
}

export default function FoodCardsTab() {
  const { data, error, status } = useLiveData<Payload>('/api/yerid/dashboard/food-cards', 60 * 1000)

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        {error && status !== null
          ? <p className="px-6 text-center text-[#9A2F24]">{error}</p>
          : <Loader2 className="animate-spin text-[#14213D]" />}
      </div>
    )
  }

  const { total, byStatus, byHome, byMonth } = data
  const loaded = byStatus.loaded
  const maxMonth = Math.max(1, ...byMonth.map(m => m.loaded))
  const panel = 'rounded-3xl border border-[#E6E1D6] bg-white p-5 shadow-[0_1px_2px_rgba(20,33,61,.04)] sm:p-7'

  return (
    <div className="flex flex-col gap-6">
      {/* ── פתיחה: הסכום שנטען + טבעת ── */}
      <section className="grid gap-6 rounded-3xl bg-[#14213D] p-6 text-[#F4F1EA] sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-sm font-semibold text-[#C9CFDB]">סך הכול נטען בכרטיסי מזון</p>
          <p className="mt-2 text-5xl font-bold tabular-nums text-[#E7BE62] sm:text-6xl">{money(loaded.loaded)}</p>
          <p className="mt-2 text-[15px] text-[#C9CFDB]">
            {num(loaded.count)} מתוך {num(total.count)} יולדות מאושרות ({pct(loaded.count, total.count)}%)
          </p>
          <dl className="mt-6 grid grid-cols-3 gap-3">
            {[
              ['הטעינה נכשלה', num(byStatus.failed.count), 'דורשות טיפול'],
              ['טרם נטענו', num(byStatus.idle.count + byStatus.pending.count), 'כולל בטעינה'],
              ['יתרה שמורה', money(total.balance), 'ערך אחרון בתיק'],
            ].map(([l, v, s]) => (
              <div key={l} className="rounded-2xl bg-white/8 px-4 py-3">
                <dt className="text-xs text-[#C9CFDB]">{l}</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">{v}</dd>
                <dd className="text-[11px] text-[#9FA8BC]">{s}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mx-auto"><Ring total={total.count} parts={CARD_STATUS_KEYS.map(k => ({ color: COLORS[k], value: byStatus[k].count }))} /></div>
      </section>

      {/* ── אריחי סטטוס ── */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {CARD_STATUS_KEYS.map(k => (
          <div key={k} className="rounded-2xl border border-[#E6E1D6] bg-white p-4" style={{ borderTop: `4px solid ${COLORS[k]}` }}>
            <p className="text-sm font-semibold text-[#5B6475]">{CARD_STATUS_LABELS[k]}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{num(byStatus[k].count)}</p>
            <p className="text-xs text-[#7A8294]">{pct(byStatus[k].count, total.count)}% מהיולדות</p>
          </div>
        ))}
      </section>

      {/* ── בתי החלמה ── */}
      <section className={panel}>
        <h2 className="text-xl font-bold">לפי בית החלמה</h2>
        <p className="mt-1 text-sm text-[#5B6475]">אורך הפס לפי מספר היולדות, והצבעים לפי סטטוס הכרטיס</p>
        <ul className="mt-5 flex flex-col gap-5">
          {byHome.map(h => {
            const max = Math.max(1, byHome[0]?.total.count ?? 1)
            return (
              <li key={h.home}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="text-[17px] font-bold">{h.home}</span>
                  <span className="text-sm tabular-nums text-[#5B6475]">
                    {num(h.total.count)} יולדות · <b className="text-[#14213D]">{money(h.total.loaded)}</b> נטען
                  </span>
                </div>
                <div className="mt-2 flex h-4 overflow-hidden rounded-full bg-[#F1ECE0]" style={{ width: `${(h.total.count / max) * 100}%`, minWidth: '12%' }}>
                  {CARD_STATUS_KEYS.map(k => h.byStatus[k] > 0 && (
                    <span key={k} title={`${CARD_STATUS_LABELS[k]}: ${h.byStatus[k]}`}
                      style={{ width: `${(h.byStatus[k] / h.total.count) * 100}%`, background: COLORS[k] }} />
                  ))}
                </div>
                <p className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-[#5B6475]">
                  {CARD_STATUS_KEYS.map(k => h.byStatus[k] > 0 && (
                    <span key={k} className="flex items-center gap-1.5">
                      <i className="h-2 w-2 rounded-full" style={{ background: COLORS[k] }} />
                      {CARD_STATUS_LABELS[k]} {h.byStatus[k]}
                    </span>
                  ))}
                </p>
              </li>
            )
          })}
        </ul>
      </section>

      {/* ── חודשים ── */}
      <section className={panel}>
        <h2 className="text-xl font-bold">טעינות לפי חודש</h2>
        {byMonth.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#5B6475]">אין טעינות</p>
        ) : (
          <div className="mt-6 flex h-56 items-end gap-2 sm:gap-4">
            {byMonth.map(m => (
              <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                <span className="text-xs font-bold tabular-nums sm:text-sm">{money(m.loaded)}</span>
                <div className="mx-auto mt-1 w-full max-w-14 rounded-t-lg bg-[#B8862B]" style={{ height: `${Math.max(4, (m.loaded / maxMonth) * 78)}%` }} />
                <span className="mt-2 text-xs text-[#5B6475]">{monthLabel(m.month)}</span>
                <span className="text-[11px] text-[#7A8294]">{num(m.count)} כרטיסים</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-center text-[13px] text-[#5B6475]">
        מחלקת יולדות · הנתונים מהמסד, מתעדכנים כל דקה · סכום הטעינה נספר רק לכרטיסים שנטענו
      </p>
    </div>
  )
}
