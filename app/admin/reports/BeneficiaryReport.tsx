'use client'
import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, FileSpreadsheet, AlertTriangle, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import type { ReportRow, ReportFilters, GroupBy } from '@/lib/reportFilters'

// ─────────────────────────────────────────────────────────────────────────────
// מרכז דוחות הצאצאים — כל הסינונים במסך אחד, ומשולבים.
//
// אפשר לבקש "דור 8 + בית שמש + 5 ילדים ומעלה" בבת אחת, לראות מונה חי,
// ולהוריד אקסל באותו עיצוב של הייצוא הקיים.
//
// 🔴 שורת המוחרגים אינה קישוט: 263 משפחות בלי שיוך לדור ו-62 בלי תאריך
// לידה נופלות מכל סינון על השדות האלה. בלי הצגה מפורשת המשתמש מניח
// שהדוח מלא, והחוסר נראה כמו נתון.
// ─────────────────────────────────────────────────────────────────────────────

type Options = {
  communities: string[]; cities: string[]; generations: number[]
  maritalStatuses: string[]; statuses: string[]
}
type Data = {
  total: number; totalAll: number
  excluded: { reason: string; count: number }[]
  preview: ReportRow[]
  options: Options
}

const COLUMN_LABELS: Record<string, string> = {
  familyName: 'שם משפחה', fullName: 'שם פרטי', idNumber: 'ת"ז',
  community: 'קהילה', generation: 'דור', city: 'עיר', address: 'כתובת',
  phone: 'טלפון', email: 'אימייל', birthDate: 'תאריך לידה',
  childrenCount: 'מספר ילדים', maritalStatus: 'מצב משפחתי', status: 'סטטוס',
}
const DEFAULT_COLUMNS = [
  'familyName', 'fullName', 'idNumber', 'community', 'generation',
  'city', 'address', 'phone', 'birthDate', 'childrenCount', 'maritalStatus',
]
const STATUS_HE: Record<string, string> = {
  approved: 'מאושר', pending: 'ממתין', rejected: 'נדחה',
  docs_pending: 'השלמת מסמכים', docs_returned: 'הוחזר תיקון', review: 'בבדיקה',
}

export default function BeneficiaryReport() {
  const toast = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  const [filters, setFilters] = useState<ReportFilters>({})
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS)
  const [groupBy, setGroupBy] = useState<GroupBy | ''>('')

  const load = useCallback(async (f: ReportFilters): Promise<string | null> => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/reports/beneficiaries?filters=${encodeURIComponent(JSON.stringify(f))}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
      setData(json)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    } finally {
      setLoading(false)
    }
  }, [])

  // ⚠️ הסינון מריץ שליפה מחדש — כך המונה חי ומשקף בדיוק את מה שיירד.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(filters).then(err => { if (alive && err) toast.error(err) })
    return () => { alive = false }
  }, [filters])

  const toggleIn = <T,>(key: keyof ReportFilters, value: T) =>
    setFilters(prev => {
      const list = (prev[key] as T[] | undefined) ?? []
      const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value]
      return { ...prev, [key]: next }
    })

  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v))

  const download = async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/admin/reports/beneficiaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, columns, groupBy: groupBy || null }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'יצירת הקובץ נכשלה')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `דוח-צאצאים-${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('הקובץ הורד')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setDownloading(false)
    }
  }

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
      active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
    }`

  const hasFilters = Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : v != null)

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <FileSpreadsheet size={16} className="text-emerald-600" />
          דוח צאצאים — סינון והנפקה לאקסל
        </h2>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <button
              onClick={() => setFilters({})}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <X size={12} /> נקה סינון
            </button>
          )}
          <button
            onClick={download} disabled={downloading || loading || (data?.total ?? 0) === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {downloading ? 'מכין…' : 'הורד אקסל'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* ── המונה ── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-700">
            {loading ? '…' : `${(data?.total ?? 0).toLocaleString('he-IL')} משפחות`}
          </span>
          {data && data.total !== data.totalAll && (
            <span className="text-xs text-slate-400">מתוך {data.totalAll.toLocaleString('he-IL')}</span>
          )}
        </div>

        {/* 🔴 המוחרגים — בלי זה החוסר נראה כמו נתון */}
        {data && data.excluded.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-600" />
            <p className="text-xs text-amber-900">
              {data.excluded.map(e => `${e.count} הוחרגו (${e.reason})`).join(' · ')}
              {' — '}רשומות שחסר בהן הנתון שסוננתם לפיו.
            </p>
          </div>
        )}

        {/* ── הסינונים ── */}
        {data && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="קהילה">
              <ChipList
                values={data.options.communities}
                selected={filters.communities ?? []}
                onToggle={v => toggleIn('communities', v)}
                chip={chip}
              />
            </Field>

            <Field label="דור">
              <div className="flex flex-wrap gap-1.5">
                {data.options.generations.map(g => (
                  <button key={g} type="button" onClick={() => toggleIn('generations', g)}
                    className={chip((filters.generations ?? []).includes(g))}>
                    דור {g}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="עיר">
              <ChipList
                values={data.options.cities}
                selected={filters.cities ?? []}
                onToggle={v => toggleIn('cities', v)}
                chip={chip}
              />
            </Field>

            <Field label="מצב משפחתי">
              <div className="flex flex-wrap gap-1.5">
                {data.options.maritalStatuses.map(m => (
                  <button key={m} type="button" onClick={() => toggleIn('maritalStatuses', m)}
                    className={chip((filters.maritalStatuses ?? []).includes(m))}>
                    {m}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="גיל">
              <Range
                min={filters.ageMin} max={filters.ageMax}
                onMin={v => setFilters(p => ({ ...p, ageMin: num(v) }))}
                onMax={v => setFilters(p => ({ ...p, ageMax: num(v) }))}
              />
            </Field>

            <Field label="מספר ילדים">
              <Range
                min={filters.childrenMin} max={filters.childrenMax}
                onMin={v => setFilters(p => ({ ...p, childrenMin: num(v) }))}
                onMax={v => setFilters(p => ({ ...p, childrenMax: num(v) }))}
              />
            </Field>

            <Field label="סטטוס רישום">
              <div className="flex flex-wrap gap-1.5">
                {data.options.statuses.map(s => (
                  <button key={s} type="button" onClick={() => toggleIn('statuses', s)}
                    className={chip((filters.statuses ?? []).includes(s))}>
                    {STATUS_HE[s] ?? s}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="גיליון סיכום (קבץ לפי)">
              <div className="flex flex-wrap gap-1.5">
                {([['', 'ללא'], ['community', 'קהילה'], ['generation', 'דור'], ['city', 'עיר']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setGroupBy(v)} className={chip(groupBy === v)}>
                    {l}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* ── עמודות הייצוא ── */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">עמודות בקובץ</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(COLUMN_LABELS).map(([key, label]) => (
              <button key={key} type="button"
                onClick={() => setColumns(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])}
                className={chip(columns.includes(key))}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── תצוגה מקדימה ──
            ⚠️ בלי גלילה לרוחב: עמודות משניות מוסתרות במסך צר במקום
            להיחתך. זו תצוגה מקדימה בלבד; הקובץ מכיל את כל העמודות
            שנבחרו. ראו docs/no-horizontal-scroll.md */}
        {data && data.preview.length > 0 && (
          <div className="rounded-lg border border-slate-200">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 font-semibold text-slate-500">שם משפחה</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">שם פרטי</th>
                  <th className="hidden px-3 py-2 font-semibold text-slate-500 sm:table-cell">קהילה</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">דור</th>
                  <th className="hidden px-3 py-2 font-semibold text-slate-500 md:table-cell">עיר</th>
                  <th className="px-3 py-2 font-semibold text-slate-500">ילדים</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.preview.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5">{r.familyName}</td>
                    <td className="px-3 py-1.5">{r.fullName}</td>
                    <td className="hidden px-3 py-1.5 text-slate-500 sm:table-cell">{r.community ?? '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.generation ?? '—'}</td>
                    <td className="hidden px-3 py-1.5 text-slate-500 md:table-cell">{r.city ?? '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.childrenCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.total > data.preview.length && (
              <p className="border-t border-slate-100 px-3 py-2 text-center text-xs text-slate-400">
                מוצגות {data.preview.length} מתוך {data.total.toLocaleString('he-IL')} — הקובץ יכלול את כולן
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  )
}

function Range({ min, max, onMin, onMax }: {
  min?: number | null; max?: number | null
  onMin: (v: string) => void; onMax: (v: string) => void
}) {
  const cls = 'w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span>מ־</span>
      <input type="number" value={min ?? ''} onChange={e => onMin(e.target.value)} className={cls} />
      <span>עד</span>
      <input type="number" value={max ?? ''} onChange={e => onMax(e.target.value)} className={cls} />
    </div>
  )
}

/**
 * רשימת צ'יפים עם חיפוש — לרשימות ארוכות (קהילות, ערים).
 * ⚠️ בלי החיפוש 134 קהילות ו-75 ערים היו הופכות את המסך לבלתי שמיש.
 */
function ChipList({ values, selected, onToggle, chip }: {
  values: string[]; selected: string[]
  onToggle: (v: string) => void; chip: (active: boolean) => string
}) {
  const [q, setQ] = useState('')
  const shown = q.trim() ? values.filter(v => v.includes(q.trim())) : values
  return (
    <div className="flex flex-col gap-1.5">
      <input
        value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש…"
        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {selected.map(v => (
          <button key={`s-${v}`} type="button" onClick={() => onToggle(v)} className={chip(true)}>{v}</button>
        ))}
        {shown.filter(v => !selected.includes(v)).slice(0, 60).map(v => (
          <button key={v} type="button" onClick={() => onToggle(v)} className={chip(false)}>{v}</button>
        ))}
      </div>
    </div>
  )
}
