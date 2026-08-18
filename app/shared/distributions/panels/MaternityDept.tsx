'use client'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { DeptHeader, Stat, BarList, Section, Ils } from './Chrome'

// ─────────────────────────────────────────────────────────────────────────────
// מחלקת עזר יולדות — תצוגה בלבד.
//
// 🔴 השאלה שהמסך עונה עליה: **כמה שולם, למי, ומתי.** לכן הפילוח המרכזי הוא
// לפי בית החלמה, מסונן לפי טווח תאריכים — בדיוק כפי שנשאל.
//
// ⚠️ ההבחנה שאסור לטשטש: **מומש** (היולדת הגיעה) מול **חויב** (בית ההחלמה
// הגיש קבלה). הפער ביניהם הוא כסף שטרם שולם, והוא נעלם לגמרי כשמציגים
// סכום אחד מאוחד.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#0f766e'

export interface MaternityRow {
  id: string
  birth_date?: string | null
  baby_name?: string | null
  recovery_home?: string | null
  recovery_arrived?: boolean | null
  recovery_arrived_at?: string | null
  recovery_nights?: number | null
  recovery_amount?: number | null
  receiptCount?: number | null
  status?: string | null
  created_at?: string | null
  beneficiary?: {
    family_name?: string | null
    full_name?: string | null
    spouse_name?: string | null
    city?: string | null
  } | null
}

// ⚠️ רכיב ולא מחרוזת — ראה Ils ב-Chrome.
const cur = (n: number) => <Ils value={n} />
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString('he-IL') : '—')

const monthKey = (s?: string | null) => {
  if (!s) return null
  const t = new Date(s)
  if (isNaN(t.getTime())) return null
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (k: string) => {
  const [y, m] = k.split('-')
  return `${m}/${y.slice(2)}`
}

export default function MaternityDept({ rows, onBack }: { rows: MaternityRow[]; onBack: () => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [home, setHome] = useState('all')
  const [q, setQ] = useState('')

  // ⚠️ הסינון לפי *תאריך ההגעה* ולא הלידה: השאלה היא כמה שולם בתקופה,
  // והתשלום נגזר מהשהות בבית ההחלמה.
  const filtered = useMemo(() => {
    const f = from ? new Date(from).getTime() : null
    const t = to ? new Date(to).getTime() + 86_400_000 : null
    return rows.filter(r => {
      if (home !== 'all' && (r.recovery_home?.trim() || '—') !== home) return false
      if (!f && !t) return true
      const when = r.recovery_arrived_at ?? r.birth_date
      if (!when) return false
      const ts = new Date(when).getTime()
      if (isNaN(ts)) return false
      if (f && ts < f) return false
      if (t && ts >= t) return false
      return true
    })
  }, [rows, from, to, home, q])

  const stats = useMemo(() => {
    let arrived = 0, billed = 0, nights = 0, paid = 0, unbilled = 0
    const byHome = new Map<string, { amount: number; count: number; nights: number }>()
    const byMonth = new Map<string, number>()

    for (const r of filtered) {
      const amt = Number(r.recovery_amount ?? 0) || 0
      const has = (r.receiptCount ?? 0) > 0
      if (r.recovery_arrived) arrived++
      if (has) { billed++; paid += amt } else if (r.recovery_arrived) unbilled += amt
      nights += Number(r.recovery_nights ?? 0) || 0

      const h = r.recovery_home?.trim()
      if (h) {
        const c = byHome.get(h) ?? { amount: 0, count: 0, nights: 0 }
        c.amount += has ? amt : 0
        c.count++
        c.nights += Number(r.recovery_nights ?? 0) || 0
        byHome.set(h, c)
      }
      const mk = monthKey(r.recovery_arrived_at ?? r.birth_date)
      if (mk && has) byMonth.set(mk, (byMonth.get(mk) ?? 0) + amt)
    }

    return {
      arrived, billed, nights, paid, unbilled,
      homes: [...byHome.entries()].sort((a, b) => b[1].amount - a[1].amount),
      months: [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12),
    }
  }, [filtered])

  // ⚠️ עם מונה לכל בית — הכפתור עצמו מספר כמה יולדות שם, בלי להיכנס.
  const homeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const h = r.recovery_home?.trim()
      if (h) m.set(h, (m.get(h) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  const homeChip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[11px] font-bold transition ${
      on ? 'border-[#0f766e] bg-[#0f766e] text-white' : 'border-[#e8dfc9] bg-white text-[#6b5d3e] hover:border-[#0f766e]/40'
    }`

  return (
    <div className="flex flex-col gap-5">
      <DeptHeader title="עזר יולדות" subtitle="בתי החלמה · תשלומים · כרטיסי מזון" ink={INK} onBack={onBack} />

      {/* ── מסננים ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#e8dfc9] bg-white px-5 py-4">
        {/* ⚠️ חיפוש חופשי על כל השדות — לא צריך לדעת מראש באיזו עמודה. */}
        <div className="relative">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-[#c4b998]" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="חיפוש בשם, עיר, בית החלמה או שם התינוק…"
            className="w-full rounded-xl border border-[#e8dfc9] py-2.5 pr-9 pl-3 text-[13px] text-[#3a3630] outline-none focus:border-[#d9b95c]" />
        </div>

        {/* 🔴 כפתורי סינון ולא רשימה נפתחת: הרשימה הסתירה כמה בתי החלמה יש
            ומה גודלם, וחייבה שתי פעולות לכל בדיקה. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-[#a08a5a]">בית החלמה:</span>
          <button type="button" onClick={() => setHome('all')} className={homeChip(home === 'all')}>
            הכל ({rows.length})
          </button>
          {homeCounts.map(([name, count]) => (
            <button key={name} type="button" onClick={() => setHome(home === name ? 'all' : name)}
              className={homeChip(home === name)}>
              {name} ({count})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[#a08a5a]">מתאריך</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-xl border border-[#e8dfc9] px-3 py-2 text-[12px] text-[#3a3630] outline-none focus:border-[#d9b95c]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-[#a08a5a]">עד תאריך</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-xl border border-[#e8dfc9] px-3 py-2 text-[12px] text-[#3a3630] outline-none focus:border-[#d9b95c]" />
        </label>
        {(from || to || home !== 'all' || q) && (
          <button type="button" onClick={() => { setFrom(''); setTo(''); setHome('all'); setQ('') }}
            className="rounded-xl border border-[#e8dfc9] px-3 py-2 text-[11px] font-bold text-[#8a7a56] transition hover:border-rose-300 hover:text-rose-600">
            ניקוי המסננים
          </button>
        )}
        <span className="mr-auto text-[11px] text-[#a08a5a]">
          מוצגות <b className="text-[#3a3630] ltr-num">{filtered.length.toLocaleString('he-IL')}</b> רשומות
        </span>
        </div>
      </div>

      {/* ── מספרי ליבה ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="לידות בתקופה" value={filtered.length.toLocaleString('he-IL')} ink={INK} />
        <Stat label="הגיעו לבית החלמה" value={stats.arrived.toLocaleString('he-IL')} ink={INK} />
        <Stat label="סך הלילות" value={stats.nights.toLocaleString('he-IL')} ink={INK} />
        <Stat label="שולם בפועל" value={cur(stats.paid)} sub={`${stats.billed} חויבו`} ink="#047857" />
        {/* 🔴 הפער: מומש אך טרם חויב — כסף שעתיד לצאת ואינו מופיע בשום סיכום. */}
        <Stat label="מומש וטרם חויב" value={cur(stats.unbilled)}
          sub={stats.unbilled > 0 ? 'ממתין לקבלה' : 'הכל חויב'}
          ink={stats.unbilled > 0 ? '#b45309' : '#8a7a56'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="תשלומים לפי בית החלמה" hint="לפי סכום ששולם">
          <BarList ink={INK} fmt={cur}
            items={stats.homes.map(([name, v]) => ({
              label: name, value: v.amount, sub: `${v.count} יולדות · ${v.nights} לילות`,
            }))} />
        </Section>

        <Section title="תשלומים לפי חודש" hint="12 החודשים האחרונים">
          <BarList ink={INK} fmt={cur}
            items={stats.months.map(([k, v]) => ({ label: monthLabel(k), value: v }))} />
        </Section>
      </div>

      {/* ⚠️ בלי גלילה לרוחב: עמודות מאוחדות (שם+עיר, בית החלמה+הגעה). */}
      <Section title="רשימת היולדות" hint={`${filtered.length.toLocaleString('he-IL')} רשומות`}>
        <div className="w-full">
          <table className="w-full table-auto text-[12px] border-collapse">
            <thead>
              <tr className="bg-[#fdfaf3] text-[#8a7a56] [&>th]:px-2.5 [&>th]:py-2 [&>th]:text-right [&>th]:font-bold [&>th]:border-l [&>th]:border-[#f0e9d8] [&>th:last-child]:border-l-0">
                <th>שם המשפחה</th><th>תאריך לידה</th><th>בית החלמה</th>
                <th className="text-center">לילות</th><th>סכום</th><th>מצב</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f4efe2]">
              {filtered.slice(0, 300).map(r => {
                const b = r.beneficiary
                const name = [b?.family_name, b?.spouse_name || b?.full_name].filter(Boolean).join(' ') || '—'
                const has = (r.receiptCount ?? 0) > 0
                return (
                  <tr key={r.id} className="[&>td]:px-2.5 [&>td]:py-2 [&>td]:border-l [&>td]:border-[#f4efe2] [&>td:last-child]:border-l-0">
                    <td className="max-w-[170px]">
                      <div className="truncate font-bold text-[#3a3630]" title={name}>{name}</div>
                      {b?.city && <div className="truncate text-[11px] text-[#a08a5a]">{b.city}</div>}
                    </td>
                    <td className="ltr-num text-[#6b5d3e] whitespace-nowrap">{d(r.birth_date)}</td>
                    <td className="max-w-[150px]">
                      <div className="truncate text-[#6b5d3e]" title={r.recovery_home ?? ''}>{r.recovery_home || '—'}</div>
                      {r.recovery_arrived && (
                        <div className="text-[11px] text-emerald-700 ltr-num">הגיעה {d(r.recovery_arrived_at)}</div>
                      )}
                    </td>
                    <td className="text-center ltr-num text-[#6b5d3e]">{r.recovery_nights ?? '—'}</td>
                    <td className="ltr-num font-bold whitespace-nowrap" style={{ color: has ? '#047857' : '#a08a5a' }}>
                      {Number(r.recovery_amount ?? 0) > 0 ? cur(Number(r.recovery_amount)) : '—'}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        has ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : r.recovery_arrived ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                        {has ? 'חויב' : r.recovery_arrived ? 'ממתין לקבלה' : 'טרם מומש'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length > 300 && (
            <p className="pt-3 text-center text-[11px] text-[#a08a5a]">
              מוצגות 300 הראשונות מתוך {filtered.length.toLocaleString('he-IL')} · צמצמו את טווח התאריכים לתצוגה מלאה
            </p>
          )}
        </div>
      </Section>
    </div>
  )
}
