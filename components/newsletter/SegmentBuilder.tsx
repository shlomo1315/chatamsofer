'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Users, Loader2, MailX, Ban, Filter, Trash2, Plus, UserMinus, RotateCcw, Download, Upload } from 'lucide-react'
import type { SegmentDef, SegmentSource } from '@/lib/newsletter/segments'

// ─────────────────────────────────────────────────────────────────────────────
// בונה הקהל.
//
// הסדר: קודם בוחרים מקור ומסננים, ורק אז מופיעה הרשימה המלאה —
// שאותה אפשר לערוך: להסיר נמענים שלא רוצים, ולהוסיף כתובות ידנית.
// ─────────────────────────────────────────────────────────────────────────────

interface RecipientRow {
  email: string
  name: string
  city: string
  isManual: boolean
}

interface PreviewResult {
  total: number
  noEmail: number
  suppressed: number
  excluded: number
  truncated: boolean
  recipients: RecipientRow[]
}

interface FilterOptions {
  cities: string[]
  communities: string[]
  maritalStatuses: string[]
  eligibilityStatuses: string[]
}

const SOURCES: { value: SegmentSource; label: string; description: string }[] = [
  { value: 'beneficiaries', label: 'צאצאים', description: 'הצאצאים הרשומים במערכת' },
  { value: 'staff', label: 'צוות', description: 'אנשי הצוות של הארגון' },
  { value: 'recovery_homes', label: 'בתי החלמה', description: 'כתובות הדיווח של בתי ההחלמה' },
  { value: 'contact_list', label: 'רשימה מקובץ', description: 'נמענים שהעליתם מקובץ Excel' },
]

// תוויות לסטטוסי הזכאות — רק אלה שקיימים בפועל ב-DB יוצגו
const ELIGIBILITY_LABELS: Record<string, string> = {
  pending: 'ממתין',
  approved: 'מאושר',
  rejected: 'נדחה',
  review: 'בבדיקה',
  docs_pending: 'ממתין למסמכים',
}

const CARD = 'rounded-2xl border border-slate-200 bg-white'

export default function SegmentBuilder({
  value,
  onChange,
}: {
  value: SegmentDef
  onChange: (v: SegmentDef) => void
}) {
  const def = value ?? { source: 'beneficiaries' as SegmentSource }

  const [options, setOptions] = useState<FilterOptions>({
    cities: [], communities: [], maritalStatuses: [], eligibilityStatuses: [],
  })
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [manualEmail, setManualEmail] = useState('')
  const [manualName, setManualName] = useState('')
  const reqId = useRef(0)

  const patch = useCallback((p: Partial<SegmentDef>) => {
    onChange({ ...def, ...p })
  }, [def, onChange])

  // ערכי המסננים — נגזרים מהנתונים האמיתיים, לא מרשימה קבועה בקוד
  useEffect(() => {
    fetch('/api/admin/segments/preview')
      .then(r => r.json())
      .then(d => setOptions({
        cities: d.cities ?? [],
        communities: d.communities ?? [],
        maritalStatuses: d.maritalStatuses ?? [],
        eligibilityStatuses: d.eligibilityStatuses ?? [],
      }))
      .catch(() => { /* ignore */ })
  }, [])

  // טעינת הרשימה — עם debounce, ותשובות ישנות נזרקות
  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/segments/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(def),
        })
        const d = await res.json()
        if (id === reqId.current) setResult(d)
      } catch { /* ignore */ }
      finally { if (id === reqId.current) setLoading(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [JSON.stringify(def)]) // eslint-disable-line react-hooks/exhaustive-deps

  const isBen = def.source === 'beneficiaries'
  const recipients = result?.recipients ?? []

  // ── פעולות על הרשימה ──
  function toggleCheck(email: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }

  function toggleAll() {
    setChecked(prev =>
      prev.size === recipients.length ? new Set() : new Set(recipients.map(r => r.email)),
    )
  }

  function removeChecked() {
    if (!checked.size) return
    const excluded = new Set(def.excluded ?? [])
    const manual = (def.manual ?? []).filter(m => !checked.has(m.email.toLowerCase()))
    for (const email of checked) excluded.add(email)
    patch({ excluded: [...excluded], manual })
    setChecked(new Set())
  }

  function removeOne(email: string) {
    const excluded = new Set(def.excluded ?? [])
    excluded.add(email)
    patch({
      excluded: [...excluded],
      manual: (def.manual ?? []).filter(m => m.email.toLowerCase() !== email),
    })
  }

  function restoreExcluded() {
    patch({ excluded: [] })
  }

  function addManual() {
    const email = manualEmail.trim().toLowerCase()
    if (!email.includes('@')) return
    const manual = [...(def.manual ?? [])]
    if (!manual.some(m => m.email.toLowerCase() === email)) {
      manual.push({ email, name: manualName.trim() || undefined })
    }
    // אם הכתובת הוסרה קודם — מחזירים אותה
    patch({
      manual,
      excluded: (def.excluded ?? []).filter(e => e !== email),
    })
    setManualEmail('')
    setManualName('')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── 1. מקור הקהל ── */}
      <div className={`${CARD} p-5`}>
        <h3 className="mb-1 text-base font-bold text-slate-800">לאיזו קבוצה תרצה לשלוח את ההודעה?</h3>
        <p className="mb-4 text-xs text-slate-500">
          בחרו את מקור הנמענים. אם הקבוצה שאתם צריכים אינה במערכת — העלו רשימה מקובץ.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {SOURCES.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange({ source: s.value })}
              className={`rounded-xl border p-3 text-right transition ${
                def.source === s.value
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
              }`}
            >
              <div className={`text-sm font-bold ${def.source === s.value ? 'text-indigo-800' : 'text-slate-700'}`}>
                {s.label}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">{s.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── רשימות מקובץ ── */}
      {def.source === 'contact_list' && (
        <ContactLists
          selectedId={def.contactListId}
          onSelect={id => patch({ contactListId: id })}
        />
      )}

      {/* ── 2. מסננים ── */}
      {isBen && (
        <div className={`${CARD} p-5`}>
          <div className="mb-4 flex items-center gap-1.5">
            <Filter size={15} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">מסננים</h3>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* סטטוס זכאות */}
            {options.eligibilityStatuses.length > 0 && (
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-500">סטטוס זכאות</label>
                <div className="flex flex-wrap gap-1.5">
                  {options.eligibilityStatuses.map(s => (
                    <Pill
                      key={s}
                      label={ELIGIBILITY_LABELS[s] ?? s}
                      active={(def.eligibilityStatus ?? []).includes(s)}
                      onClick={() => {
                        const cur = def.eligibilityStatus ?? []
                        patch({
                          eligibilityStatus: cur.includes(s)
                            ? cur.filter(x => x !== s)
                            : [...cur, s],
                        })
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* מצב משפחתי — רק הערכים שקיימים בפועל */}
            {options.maritalStatuses.length > 0 && (
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-500">מצב משפחתי</label>
                <div className="flex flex-wrap gap-1.5">
                  {options.maritalStatuses.map(s => (
                    <Pill
                      key={s}
                      label={s}
                      active={(def.maritalStatus ?? []).includes(s)}
                      onClick={() => {
                        const cur = def.maritalStatus ?? []
                        patch({
                          maritalStatus: cur.includes(s)
                            ? cur.filter(x => x !== s)
                            : [...cur, s],
                        })
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* עיר */}
            {options.cities.length > 0 && (
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-500">
                  עיר {(def.city?.length ?? 0) > 0 && (
                    <span className="text-indigo-600">({def.city!.length} נבחרו)</span>
                  )}
                </label>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {options.cities.map(city => (
                    <label key={city} className="flex cursor-pointer items-center gap-2 px-1.5 py-1 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={(def.city ?? []).includes(city)}
                        onChange={() => {
                          const cur = def.city ?? []
                          patch({ city: cur.includes(city) ? cur.filter(c => c !== city) : [...cur, city] })
                        }}
                        className="h-3.5 w-3.5 accent-indigo-600"
                      />
                      <span className="text-sm text-slate-700">{city}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* שיוך קהילתי */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-500">שיוך קהילתי</label>
              <input
                list="communities"
                value={def.communityAffiliation ?? ''}
                onChange={e => patch({ communityAffiliation: e.target.value || undefined })}
                placeholder="חיפוש חופשי…"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                           focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <datalist id="communities">
                {options.communities.map(c => <option key={c} value={c} />)}
              </datalist>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <NumInput label="מינימום ילדים" value={def.minChildren}
                          onChange={v => patch({ minChildren: v })} />
                <NumInput label="מקסימום ילדים" value={def.maxChildren}
                          onChange={v => patch({ maxChildren: v })} />
                <NumInput label="יש ילד מגיל" value={def.childAgeFrom}
                          onChange={v => patch({ childAgeFrom: v })} />
                <NumInput label="עד גיל" value={def.childAgeTo}
                          onChange={v => patch({ childAgeTo: v })} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-4">
            <Check label="פעיל בלבד" value={def.isActive}
                   onChange={v => patch({ isActive: v })} />
            <Check label="יש הלוואה פעילה" value={def.hasLoan}
                   onChange={v => patch({ hasLoan: v })} />
            <Check label="קיבל עזר יולדות" value={def.hadMaternity}
                   onChange={v => patch({ hadMaternity: v })} />
          </div>
        </div>
      )}

      {/* ── 3. הרשימה — אחרי המסננים ── */}
      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-white">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Users size={18} />}
            </div>
            <div>
              <div className="text-2xl font-black text-slate-800">
                {(result?.total ?? 0).toLocaleString('he-IL')} נמענים
              </div>
              <div className="flex flex-wrap gap-x-3 text-xs text-slate-400">
                {(result?.noEmail ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <MailX size={11} /> {result!.noEmail} ללא מייל
                  </span>
                )}
                {(result?.suppressed ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Ban size={11} /> {result!.suppressed} הוסרו מרשימת התפוצה
                  </span>
                )}
                {(result?.excluded ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <UserMinus size={11} /> {result!.excluded} הסרת ידנית
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {(result?.excluded ?? 0) > 0 && (
              <button
                type="button"
                onClick={restoreExcluded}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2
                           text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <RotateCcw size={13} /> החזר את שהוסרו
              </button>
            )}
            {checked.size > 0 && (
              <button
                type="button"
                onClick={removeChecked}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2
                           text-xs font-bold text-white transition hover:bg-rose-700"
              >
                <Trash2 size={13} /> הסרת {checked.size} מסומנים
              </button>
            )}
          </div>
        </div>

        {/* הוספה ידנית */}
        <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50 p-3">
          <input
            value={manualEmail}
            onChange={e => setManualEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addManual()}
            placeholder="הוספת כתובת ידנית…"
            className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm
                       focus:border-indigo-400 focus:outline-none"
          />
          <input
            value={manualName}
            onChange={e => setManualName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addManual()}
            placeholder="שם (אופציונלי)"
            className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm
                       focus:border-indigo-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={addManual}
            disabled={!manualEmail.includes('@')}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-1.5
                       text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
          >
            <Plus size={14} /> הוספה
          </button>
        </div>

        {/* הטבלה */}
        {!recipients.length ? (
          <p className="p-10 text-center text-sm text-slate-400">
            {loading ? 'טוען…' : 'אין נמענים — שנה את המסננים או הוסף כתובת ידנית'}
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-right text-xs text-slate-500">
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={checked.size > 0 && checked.size === recipients.length}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 accent-indigo-600"
                    />
                  </th>
                  <th className="px-3 py-2.5 font-semibold">שם</th>
                  <th className="px-3 py-2.5 font-semibold">מייל</th>
                  <th className="px-3 py-2.5 font-semibold">עיר</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recipients.map(r => (
                  <tr key={r.email} className={checked.has(r.email) ? 'bg-rose-50' : 'hover:bg-slate-50'}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked.has(r.email)}
                        onChange={() => toggleCheck(r.email)}
                        className="h-3.5 w-3.5 accent-indigo-600"
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {r.name || '—'}
                      {r.isManual && (
                        <span className="mr-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                          ידני
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.email}</td>
                    <td className="px-3 py-2 text-slate-500">{r.city || '—'}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeOne(r.email)}
                        title="הסרה מהרשימה"
                        className="text-slate-300 transition hover:text-rose-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result?.truncated && (
          <p className="border-t border-slate-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">
            מוצגים 5,000 הנמענים הראשונים. השליחה תכלול את כולם.
          </p>
        )}
      </div>
    </div>
  )
}

// ── רשימות נמענים מקובץ ──
function ContactLists({ selectedId, onSelect }: {
  selectedId?: string
  onSelect: (id: string) => void
}) {
  const [lists, setLists] = useState<{ id: string; name: string; count: number }[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/newsletter/contacts')
      const d = await res.json()
      setLists(d.lists ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  async function upload(file: File) {
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('name', file.name.replace(/\.[^.]+$/, ''))

      const res = await fetch('/api/admin/newsletter/contacts', { method: 'POST', body: form })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'העלאה נכשלה')

      await load()
      onSelect(d.listId)
      setError(d.invalid > 0
        ? `נקלטו ${d.imported} נמענים. ${d.invalid} שורות דולגו (כתובת לא תקינה).`
        : '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setUploading(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('למחוק את הרשימה?')) return
    await fetch(`/api/admin/newsletter/contacts?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className={`${CARD} p-5`}>
      <h3 className="mb-1 text-sm font-bold text-slate-800">רשימת נמענים מקובץ</h3>
      <p className="mb-4 text-xs leading-relaxed text-slate-500">
        הורידו את קובץ הדוגמה, מלאו את הנמענים שלכם, והעלו אותו בחזרה.
        הקובץ חייב להכיל עמודת <strong>מייל</strong>; שאר העמודות (שם, עיר, טלפון)
        משמשות למשתני המיזוג ואינן חובה.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href="/api/admin/newsletter/contacts?template=1"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white
                     px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <Download size={15} /> הורדת קובץ דוגמה
        </a>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2
                     text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {uploading ? 'מעלה…' : 'העלאת רשימה'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}
          className="hidden"
        />
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{error}</p>
      )}

      {!lists.length ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
          עדיין לא הועלו רשימות
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {lists.map(l => (
            <div
              key={l.id}
              className={`flex items-center justify-between gap-2 rounded-xl border p-3 transition ${
                selectedId === l.id
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(l.id)}
                className="min-w-0 flex-1 text-right"
              >
                <div className="truncate text-sm font-semibold text-slate-800">{l.name}</div>
                <div className="text-xs text-slate-400">{l.count.toLocaleString('he-IL')} נמענים</div>
              </button>
              <button
                type="button"
                onClick={() => remove(l.id)}
                className="text-slate-300 transition hover:text-rose-600"
                title="מחיקת הרשימה"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  )
}

function NumInput({ label, value, onChange }: {
  label: string; value?: number; onChange: (v: number | undefined) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-slate-400">{label}</label>
      <input
        type="number"
        min={0}
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm
                   focus:border-indigo-400 focus:outline-none"
      />
    </div>
  )
}

function Check({ label, value, onChange }: {
  label: string; value?: boolean; onChange: (v: boolean | undefined) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={value === true}
        onChange={e => onChange(e.target.checked ? true : undefined)}
        className="h-4 w-4 accent-indigo-600"
      />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  )
}
