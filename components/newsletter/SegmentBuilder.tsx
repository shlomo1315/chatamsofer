'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Users, Loader2, MailX, Ban, Filter } from 'lucide-react'
import type { SegmentDef, SegmentSource } from '@/lib/newsletter/segments'

interface PreviewStats {
  total: number
  noEmail: number
  suppressed: number
  sample: { email: string; name: string; city: string }[]
}

const SOURCES: { value: SegmentSource; label: string }[] = [
  { value: 'beneficiaries', label: 'מוטבים' },
  { value: 'staff', label: 'צוות' },
  { value: 'recovery_homes', label: 'בתי החלמה' },
]

const ELIGIBILITY: { value: string; label: string }[] = [
  { value: 'pending', label: 'ממתין' },
  { value: 'approved', label: 'מאושר' },
  { value: 'rejected', label: 'נדחה' },
  { value: 'review', label: 'בבדיקה' },
  { value: 'docs_pending', label: 'ממתין למסמכים' },
]

const MARITAL: string[] = ['נשוי/אה', 'אלמן/ה', 'גרוש/ה', 'רווק/ה']

const CARD = 'rounded-2xl border border-slate-200 bg-white'

/** toggle תלת-מצבי: לא מוגדר / כן / לא */
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | undefined
  onChange: (v: boolean | undefined) => void
}) {
  const on = value === true
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-slate-700">{label}</span>
      <div className="flex items-center gap-2">
        {value !== undefined && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[11px] text-slate-400 hover:text-slate-600"
          >
            נקה
          </button>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          onClick={() => onChange(on ? false : true)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            on ? 'bg-indigo-600' : value === false ? 'bg-rose-400' : 'bg-slate-200'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              on ? 'right-0.5' : 'right-[22px]'
            }`}
          />
        </button>
      </div>
    </div>
  )
}

function CheckPills({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[]
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const active = selected.includes(o.value)
        return (
          <label
            key={o.value}
            className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={active}
              onChange={() => onToggle(o.value)}
            />
            {o.label}
          </label>
        )
      })}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-bold text-slate-500">{children}</div>
}

const numInput =
  'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'

export default function SegmentBuilder({
  value,
  onChange,
}: {
  value: SegmentDef
  onChange: (v: SegmentDef) => void
}) {
  const [cities, setCities] = useState<string[]>([])
  const [communities, setCommunities] = useState<string[]>([])
  const [stats, setStats] = useState<PreviewStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = useCallback(
    <K extends keyof SegmentDef>(key: K, v: SegmentDef[K]) => {
      const next = { ...value, [key]: v }
      if (v === undefined || (Array.isArray(v) && v.length === 0)) delete next[key]
      onChange(next)
    },
    [value, onChange],
  )

  const toggleIn = useCallback(
    (key: 'eligibilityStatus' | 'city' | 'maritalStatus', v: string) => {
      const cur = value[key] ?? []
      const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]
      set(key, next.length ? next : undefined)
    },
    [value, set],
  )

  // ── ערכי המסננים הקיימים בפועל ──
  useEffect(() => {
    let alive = true
    fetch('/api/admin/segments/preview')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d: { cities?: string[]; communities?: string[] }) => {
        if (!alive) return
        setCities(d.cities ?? [])
        setCommunities(d.communities ?? [])
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // ── מונה חי (debounce 400ms) ──
  const reqId = useRef(0)
  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    const t = setTimeout(() => {
      fetch('/api/admin/segments/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
        .then((d: PreviewStats) => {
          if (id !== reqId.current) return
          setStats(d)
          setError(null)
        })
        .catch(() => {
          if (id !== reqId.current) return
          setError('שגיאה בחישוב הקהל')
        })
        .finally(() => {
          if (id === reqId.current) setLoading(false)
        })
    }, 400)
    return () => clearTimeout(t)
  }, [value])

  const isBen = value.source === 'beneficiaries'

  return (
    <div dir="rtl" className="space-y-4">
      {/* ── מונה הקהל ── */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-l from-white to-indigo-50/60 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1B3256] text-white">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Users className="h-5 w-5" />}
          </span>
          <div>
            <div className="text-2xl font-black text-[#1B3256]">
              {error ? '—' : `${(stats?.total ?? 0).toLocaleString('he-IL')} נמענים`}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
              {error ? (
                <span className="text-rose-600">{error}</span>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1">
                    <MailX className="h-3 w-3" />
                    {(stats?.noEmail ?? 0).toLocaleString('he-IL')} ללא כתובת מייל
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Ban className="h-3 w-3" />
                    {(stats?.suppressed ?? 0).toLocaleString('he-IL')} הוסרו מרשימת התפוצה
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {!!stats?.sample?.length && (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 font-bold">שם</th>
                  <th className="px-3 py-1.5 font-bold">מייל</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.sample.map(s => (
                  <tr key={s.email}>
                    <td className="px-3 py-1.5 text-slate-700">{s.name}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500" dir="ltr">
                      {s.email}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-1.5 text-[11px] text-slate-400">
              10 הנמענים הראשונים
            </div>
          </div>
        )}
      </div>

      {/* ── מקור ── */}
      <div className={`${CARD} p-4`}>
        <FieldLabel>מקור הקהל</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {SOURCES.map(s => {
            const active = value.source === s.value
            return (
              <label
                key={s.value}
                className={`cursor-pointer rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-[#1B3256] bg-[#1B3256] text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="segment-source"
                  className="sr-only"
                  checked={active}
                  onChange={() => onChange({ source: s.value })}
                />
                {s.label}
              </label>
            )
          })}
        </div>
      </div>

      {/* ── מסננים (מוטבים בלבד) ── */}
      {isBen && (
        <div className={`${CARD} p-4`}>
          <div className="mb-3 flex items-center gap-1.5 text-sm font-bold text-[#1B3256]">
            <Filter className="h-4 w-4 text-[#C69D2D]" />
            מסננים
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>סטטוס זכאות</FieldLabel>
              <CheckPills
                options={ELIGIBILITY}
                selected={value.eligibilityStatus ?? []}
                onToggle={v => toggleIn('eligibilityStatus', v)}
              />
            </div>

            <div>
              <FieldLabel>מצב משפחתי</FieldLabel>
              <CheckPills
                options={MARITAL.map(m => ({ value: m, label: m }))}
                selected={value.maritalStatus ?? []}
                onToggle={v => toggleIn('maritalStatus', v)}
              />
            </div>

            <div>
              <FieldLabel>עיר</FieldLabel>
              <select
                multiple
                size={5}
                value={value.city ?? []}
                onChange={e =>
                  set(
                    'city',
                    Array.from(e.target.selectedOptions, o => o.value).length
                      ? Array.from(e.target.selectedOptions, o => o.value)
                      : undefined,
                  )
                }
                className="w-full rounded-lg border border-slate-200 p-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              >
                {cities.map(c => (
                  <option key={c} value={c} className="rounded px-1 py-0.5">
                    {c}
                  </option>
                ))}
              </select>
              {!!value.city?.length && (
                <button
                  type="button"
                  onClick={() => set('city', undefined)}
                  className="mt-1 text-[11px] text-slate-400 hover:text-slate-600"
                >
                  נקה בחירה ({value.city.length})
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <FieldLabel>שיוך קהילתי</FieldLabel>
                <input
                  type="text"
                  list="segment-communities"
                  value={value.communityAffiliation ?? ''}
                  onChange={e => set('communityAffiliation', e.target.value || undefined)}
                  placeholder="חיפוש חופשי…"
                  className={numInput}
                />
                <datalist id="segment-communities">
                  {communities.map(c => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>מינימום ילדים</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    value={value.minChildren ?? ''}
                    onChange={e =>
                      set('minChildren', e.target.value === '' ? undefined : Number(e.target.value))
                    }
                    className={numInput}
                  />
                </div>
                <div>
                  <FieldLabel>מקסימום ילדים</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    value={value.maxChildren ?? ''}
                    onChange={e =>
                      set('maxChildren', e.target.value === '' ? undefined : Number(e.target.value))
                    }
                    className={numInput}
                  />
                </div>
              </div>

              <div>
                <FieldLabel>יש ילד בגיל</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    placeholder="מגיל"
                    value={value.childAgeFrom ?? ''}
                    onChange={e =>
                      set('childAgeFrom', e.target.value === '' ? undefined : Number(e.target.value))
                    }
                    className={numInput}
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="עד גיל"
                    value={value.childAgeTo ?? ''}
                    onChange={e =>
                      set('childAgeTo', e.target.value === '' ? undefined : Number(e.target.value))
                    }
                    className={numInput}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-x-6 border-t border-slate-100 pt-3 md:grid-cols-2">
            <Toggle label="פעיל" value={value.isActive} onChange={v => set('isActive', v)} />
            <Toggle label="יש הלוואה פעילה" value={value.hasLoan} onChange={v => set('hasLoan', v)} />
            <Toggle
              label="קיבל עזר יולדות"
              value={value.hadMaternity}
              onChange={v => set('hadMaternity', v)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
