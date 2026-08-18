'use client'
import { useMemo, useState } from 'react'
import { DeptHeader, Stat, BarList, Section } from './Chrome'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'

// ─────────────────────────────────────────────────────────────────────────────
// מחלקת גמ"ח הלוואות — תצוגה בלבד.
//
// 🔴 ההבחנה המרכזית: **אושר** מול **נמסר שטר** (disbursed_at). אלה שני
// אירועים נפרדים, והפער ביניהם הוא הלוואות שאושרו וטרם יצאו בפועל — נתון
// שנעלם לגמרי כשמציגים "סטטוס" אחד.
//
// ⚠️ פורטל הביצוע (/shared/loans) נשאר נפרד: שם יש כפתורי "בוצע" שמשנים
// נתונים, וכאן אין שום פעולה.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#1d4ed8'

export interface LoanRow {
  id: string
  amount?: number | null
  approved_amount?: number | null
  installments?: number | null
  purpose?: string | null
  status?: string | null
  created_at?: string | null
  approved_at?: string | null
  disbursed_at?: string | null
  beneficiary?: {
    family_name?: string | null
    full_name?: string | null
    spouse_name?: string | null
    city?: string | null
  } | null
}

export interface LegacySummary {
  count: number
  takenCount: number
  totalApproved: number
  totalTaken: number
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('he-IL')}`
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString('he-IL') : '—')

const STATUS_HE: Record<string, string> = {
  pending: 'ממתין', inquiry: 'בבירור', approved: 'מאושר',
  active: 'פעיל', completed: 'הושלם', rejected: 'נדחה', defaulted: 'בפיגור',
  awaiting_rabbi_form: 'ממתין לטופס רב',
}

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

type View = 'all' | 'disbursed' | 'approved_only' | 'pending'

// ── הגדרת עמודות רשימת ההלוואות ──
type ColKey = 'name' | 'city' | 'purpose' | 'amount' | 'installments' | 'created' | 'state'

const COLUMNS: ColDef<ColKey>[] = [
  { key: 'name', label: 'שם הלווה', def: true },
  // ⚠️ העיר הופרדה מהשם לעמודה משלה: איחוד עמודות ערבב שני ערכים בתא אחד.
  { key: 'city', label: 'עיר', def: false },
  { key: 'purpose', label: 'מטרה', def: true },
  { key: 'amount', label: 'סכום', def: true },
  { key: 'installments', label: 'תשלומים', def: true, align: 'center' },
  { key: 'created', label: 'הוגש', def: true },
  { key: 'state', label: 'מצב', def: true },
]

export default function LoansDept({ rows, legacy, onBack }: {
  rows: LoanRow[]
  legacy: LegacySummary
  onBack: () => void
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [view, setView] = useState<View>('all')

  const filtered = useMemo(() => {
    const f = from ? new Date(from).getTime() : null
    const t = to ? new Date(to).getTime() + 86_400_000 : null
    return rows.filter(r => {
      const isDisbursed = !!r.disbursed_at
      const isApproved = ['approved', 'active', 'completed'].includes(String(r.status))
      if (view === 'disbursed' && !isDisbursed) return false
      // ⚠️ "אושר וטרם נמסר" — הקבוצה שמעניינת בפועל: כסף שהוקצה ולא יצא.
      if (view === 'approved_only' && (!isApproved || isDisbursed)) return false
      if (view === 'pending' && !['pending', 'inquiry'].includes(String(r.status))) return false
      if (!f && !t) return true
      // ⚠️ הסינון לפי תאריך המסירה כשקיים, אחרת ההגשה: בתצוגת "נמסרו"
      // השאלה היא מתי הכסף יצא, לא מתי הוגשה הבקשה.
      const when = r.disbursed_at ?? r.created_at
      if (!when) return false
      const ts = new Date(when).getTime()
      if (isNaN(ts)) return false
      if (f && ts < f) return false
      if (t && ts >= t) return false
      return true
    })
  }, [rows, from, to, view])

  const stats = useMemo(() => {
    let approved = 0, disbursed = 0, pending = 0
    let disbursedAmt = 0, approvedNotOut = 0
    const byMonth = new Map<string, number>()
    const byCity = new Map<string, number>()
    const byPurpose = new Map<string, number>()

    for (const r of filtered) {
      const amt = Number(r.approved_amount ?? r.amount ?? 0) || 0
      const isApproved = ['approved', 'active', 'completed'].includes(String(r.status))
      const out = !!r.disbursed_at
      if (isApproved) approved++
      if (['pending', 'inquiry'].includes(String(r.status))) pending++
      if (out) { disbursed++; disbursedAmt += amt } else if (isApproved) approvedNotOut += amt

      if (out) {
        const mk = monthKey(r.disbursed_at)
        if (mk) byMonth.set(mk, (byMonth.get(mk) ?? 0) + amt)
      }
      const city = r.beneficiary?.city?.trim()
      if (city) byCity.set(city, (byCity.get(city) ?? 0) + 1)
      const p = r.purpose?.trim()
      if (p) byPurpose.set(p, (byPurpose.get(p) ?? 0) + 1)
    }

    return {
      approved, disbursed, pending, disbursedAmt, approvedNotOut,
      months: [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12),
      cities: [...byCity.entries()].sort((a, b) => b[1] - a[1]),
      purposes: [...byPurpose.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [filtered])

  // בורר עמודות + גרירת רוחב — רכיב מערכתי משותף.
  const tc = useTableColumns('loans-dept', COLUMNS)

  const cell = (c: ColDef<ColKey>, r: LoanRow) => {
    const b = r.beneficiary
    switch (c.key) {
      case 'name':
        return <span className="font-bold text-[#3a3630]">
          {[b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || '—'}
        </span>
      case 'city': return <span className="text-[#a08a5a]">{b?.city || '—'}</span>
      case 'purpose': return <span className="text-[#6b5d3e]">{r.purpose || '—'}</span>
      case 'amount':
        return <span className="ltr-num font-bold text-[#3a3630]">{usd(Number(r.approved_amount ?? r.amount ?? 0))}</span>
      case 'installments': return <span className="ltr-num text-[#6b5d3e]">{r.installments ?? '—'}</span>
      case 'created': return <span className="ltr-num text-[#6b5d3e]">{d(r.created_at)}</span>
      case 'state':
        return r.disbursed_at ? (
          <span className="inline-block rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
            נמסר {d(r.disbursed_at)}
          </span>
        ) : (
          <span className="inline-block rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            {STATUS_HE[String(r.status)] ?? r.status}
          </span>
        )
    }
  }

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
      on ? 'border-[#1d4ed8] bg-[#1d4ed8] text-white' : 'border-[#e8dfc9] bg-white text-[#6b5d3e] hover:border-[#cfdcfa]'
    }`

  return (
    <div className="flex flex-col gap-5">
      <DeptHeader title="גמ״ח הלוואות" subtitle="בקשות · אישורים · מסירת שטרות" ink={INK} onBack={onBack} />

      {/* ── מסננים ── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#e8dfc9] bg-white px-5 py-4">
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
        <div className="flex flex-wrap items-center gap-2">
          <button className={chip(view === 'all')} onClick={() => setView('all')}>הכל</button>
          <button className={chip(view === 'disbursed')} onClick={() => setView('disbursed')}>נמסר שטר</button>
          <button className={chip(view === 'approved_only')} onClick={() => setView('approved_only')}>אושר וטרם נמסר</button>
          <button className={chip(view === 'pending')} onClick={() => setView('pending')}>ממתין לטיפול</button>
        </div>
        {(from || to || view !== 'all') && (
          <button type="button" onClick={() => { setFrom(''); setTo(''); setView('all') }}
            className="rounded-xl border border-[#e8dfc9] px-3 py-2 text-[11px] font-bold text-[#8a7a56] transition hover:border-rose-300 hover:text-rose-600">
            ניקוי המסננים
          </button>
        )}
      </div>

      {/* ── מספרי ליבה ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="בקשות בתקופה" value={filtered.length.toLocaleString('he-IL')} ink={INK} />
        <Stat label="אושרו" value={stats.approved.toLocaleString('he-IL')} ink={INK} />
        <Stat label="נמסר שטר" value={stats.disbursed.toLocaleString('he-IL')} ink="#047857" />
        <Stat label="סכום שנמסר" value={usd(stats.disbursedAmt)} ink="#047857" />
        {/* 🔴 כסף שאושר ועדיין לא יצא — הפער שנעלם בתצוגת סטטוס רגילה. */}
        <Stat label="אושר וטרם נמסר" value={usd(stats.approvedNotOut)}
          sub={stats.approvedNotOut > 0 ? 'ממתין למסירה' : 'הכל נמסר'}
          ink={stats.approvedNotOut > 0 ? '#b45309' : '#8a7a56'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="סכום שנמסר לפי חודש" hint="12 החודשים האחרונים">
          <BarList ink={INK} fmt={usd}
            items={stats.months.map(([k, v]) => ({ label: monthLabel(k), value: v }))} />
        </Section>
        <Section title="בקשות לפי מטרה" hint="מספר בקשות">
          <BarList ink={INK} items={stats.purposes.map(([k, v]) => ({ label: k, value: v }))} max={8} />
        </Section>
      </div>

      <Section title="בקשות לפי עיר" hint="מספר בקשות">
        <BarList ink={INK} items={stats.cities.map(([k, v]) => ({ label: k, value: v }))} max={10} />
      </Section>

      {/* ── ארכיון המערכת הקודמת ── */}
      {/* ⚠️ סיכומים בלבד ולא רשומות: 1,148 שורות עם פרטים אישיים שאין בהם
          צורך בדף צפייה. */}
      {legacy.count > 0 && (
        <Section title="ארכיון — המערכת הקודמת" hint="נתונים היסטוריים">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="סך ההלוואות" value={legacy.count.toLocaleString('he-IL')} />
            <Stat label="נלקחו בפועל" value={legacy.takenCount.toLocaleString('he-IL')} ink="#047857" />
            <Stat label="סך שאושר" value={usd(legacy.totalApproved)} />
            <Stat label="סך שנלקח" value={usd(legacy.totalTaken)} ink="#047857" />
          </div>
        </Section>
      )}

      {/* ⚠️ בלי גלילה לרוחב: הבורר קובע מה נכנס למסך. */}
      <Section title="רשימת ההלוואות" hint={`${filtered.length.toLocaleString('he-IL')} רשומות`}>
        <div className="w-full">
          <div className="pb-3">{tc.picker}</div>
          <table className="w-full text-[12px] border-collapse" style={tc.rt.tableStyle}>
            <colgroup>{tc.rt.cols}</colgroup>
            <thead>
              <tr className="bg-[#fdfaf3] text-[#8a7a56] [&>th]:px-2.5 [&>th]:py-2 [&>th]:text-right [&>th]:font-bold [&>th]:border-l [&>th]:border-[#f0e9d8] [&>th:last-child]:border-l-0">
                {tc.shown.map((c, i) => (
                  <th key={c.key} className={tc.headClass(c)}>{c.label}{tc.rt.handle(i)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f4efe2]">
              {filtered.slice(0, 300).map(r => (
                <tr key={r.id} className="[&>td]:px-2.5 [&>td]:py-2 [&>td]:border-l [&>td]:border-[#f4efe2] [&>td:last-child]:border-l-0">
                  {tc.shown.map(c => (
                    <td key={c.key} className={tc.cellClass(c)}>{cell(c, r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 300 && (
            <p className="pt-3 text-center text-[11px] text-[#a08a5a]">
              מוצגות 300 הראשונות מתוך {filtered.length.toLocaleString('he-IL')} · צמצמו את הטווח לתצוגה מלאה
            </p>
          )}
        </div>
      </Section>
    </div>
  )
}
