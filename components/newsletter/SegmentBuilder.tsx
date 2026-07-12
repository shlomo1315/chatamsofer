'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Users, Loader2, MailX, Ban, Filter, Trash2, Plus, UserMinus, RotateCcw, Download, Upload, X } from 'lucide-react'
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

// שלושת המקורות הקבועים. קבוצות שמורות מתווספות אליהם דינמית כקוביות.
type FixedSource = Exclude<SegmentSource, 'contact_list'>

const SOURCES: { value: FixedSource; label: string; description: string }[] = [
  { value: 'beneficiaries', label: 'צאצאים', description: 'הצאצאים הרשומים במערכת' },
  { value: 'staff', label: 'צוות', description: 'אנשי הצוות של הארגון' },
  { value: 'recovery_homes', label: 'בתי החלמה', description: 'כתובות הדיווח של בתי ההחלמה' },
]

interface ContactList {
  id: string
  name: string
  count: number
}

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
  // בלי source — עדיין לא נבחרה קבוצה, ולכן לא מציגים רשימה.
  // (חשוב: אין ברירת מחדל, אחרת נטענת רשימה אקראית לפני שהמשתמש בחר.)
  const def = value ?? ({} as SegmentDef)

  // הרשימה נטענת רק אחרי אישור מפורש של המשתמש — לא בכל שינוי מסנן.
  // כך הוא בוחר קבוצה, מסננים או קובץ, ורק כשהוא מוכן לוחץ "הצג את הרשימה".
  const [showList, setShowList] = useState(false)

  const hasSource = Boolean(def.source)
  // רשימה מקובץ — חייבים לבחור רשימה ספציפית
  const needsList = def.source === 'contact_list' && !def.contactListId
  const canShow = hasSource && !needsList

  const [options, setOptions] = useState<FilterOptions>({
    cities: [], communities: [], maritalStatuses: [], eligibilityStatuses: [],
  })
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [manualEmail, setManualEmail] = useState('')
  const [manualName, setManualName] = useState('')
  const reqId = useRef(0)

  // ── קבוצות שמורות — כל אחת מוצגת כקובייה משלה בשורת המקורות ──
  const [lists, setLists] = useState<ContactList[]>([])
  const [showNewGroup, setShowNewGroup] = useState(false)

  const loadLists = useCallback(() =>
    fetch('/api/admin/newsletter/contacts')
      .then(r => r.json())
      .then(d => setLists(d.lists ?? []))
      .catch(() => { /* ignore */ })
  , [])

  useEffect(() => { void loadLists() }, [loadLists])

  const patch = useCallback((p: Partial<SegmentDef>) => {
    onChange({ ...def, ...p })
  }, [def, onChange])

  async function removeList(id: string) {
    if (!confirm('למחוק את הקבוצה?')) return
    try {
      await fetch(`/api/admin/newsletter/contacts?id=${id}`, { method: 'DELETE' })
    } catch { /* ignore */ }
    if (def.source === 'contact_list' && def.contactListId === id) onChange({} as SegmentDef)
    loadLists()
  }

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

  // טעינת הרשימה — רק אחרי שהמשתמש לחץ "הצג את הרשימה".
  // מרגע שהוצגה, היא מתעדכנת בכל שינוי מסנן (עם debounce).
  useEffect(() => {
    if (!showList || !canShow) { setResult(null); setLoading(false); return }

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
  }, [JSON.stringify(def), showList, canShow]) // eslint-disable-line react-hooks/exhaustive-deps

  // החלפת מקור / קבוצה מאפסת את הרשימה — צריך לאשר מחדש
  useEffect(() => { setShowList(false) }, [def.source, def.contactListId])

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
          בחרו את מקור הנמענים. אם הקבוצה שאתם צריכים אינה במערכת — צרו קבוצה חדשה.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {SOURCES.map(s => {
            const active = def.source === s.value
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => onChange({ source: s.value })}
                className={`rounded-xl border p-3 text-right transition ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                    : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                }`}
              >
                <div className={`text-sm font-bold ${active ? 'text-indigo-800' : 'text-slate-700'}`}>
                  {s.label}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{s.description}</div>
              </button>
            )
          })}

          {/* ── קבוצות שמורות — קובייה לכל אחת ── */}
          {lists.map(l => {
            const active = def.source === 'contact_list' && def.contactListId === l.id
            return (
              <div
                key={l.id}
                className={`group relative rounded-xl border transition ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                    : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onChange({ source: 'contact_list', contactListId: l.id })}
                  className="flex w-full items-start gap-2 p-3 text-right"
                >
                  <Users size={15} className={`mt-0.5 shrink-0 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-bold ${active ? 'text-indigo-800' : 'text-slate-700'}`}>
                      {l.name}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {l.count.toLocaleString('he-IL')} נמענים
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => removeList(l.id)}
                  title="מחיקת הקבוצה"
                  className="absolute left-1.5 top-1.5 rounded-md p-1 text-slate-300 opacity-0 transition
                             hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                >
                  <X size={13} />
                </button>
              </div>
            )
          })}

          {/* ── קובייה אחרונה: קבוצה חדשה ── */}
          <button
            type="button"
            onClick={() => setShowNewGroup(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300
                       p-3 text-sm font-semibold text-slate-400 transition
                       hover:border-indigo-300 hover:bg-slate-50 hover:text-indigo-600"
          >
            <Plus size={15} /> קבוצה חדשה
          </button>
        </div>
      </div>

      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreated={async id => {
            setShowNewGroup(false)
            await loadLists()
            onChange({ source: 'contact_list', contactListId: id })
          }}
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
            <Check label="קיבל עזר יולדות" value={def.hadMaternity}
                   onChange={v => patch({ hadMaternity: v })} />
          </div>
        </div>
      )}

      {/* ── 3. הרשימה — רק אחרי אישור מפורש ── */}
      {!showList ? (
        <div className={`${CARD} p-10 text-center`}>
          <Users size={26} className="mx-auto mb-3 text-slate-300" />

          {!hasSource ? (
            <>
              <p className="text-sm font-semibold text-slate-600">עדיין לא בחרתם לאיזו קבוצה לשלוח</p>
              <p className="mt-1 text-xs text-slate-400">בחרו קבוצה למעלה כדי להמשיך</p>
            </>
          ) : needsList ? (
            <>
              <p className="text-sm font-semibold text-slate-600">עדיין לא נבחרה קבוצה שמורה</p>
              <p className="mt-1 text-xs text-slate-400">בחרו קבוצה שמורה למעלה, או צרו קבוצה חדשה</p>
            </>
          ) : (
            <>
              <p className="mb-1 text-sm font-semibold text-slate-600">
                {def.source === 'beneficiaries'
                  ? 'סיימתם להגדיר את המסננים?'
                  : 'מוכנים לראות את הנמענים?'}
              </p>
              <p className="mb-5 text-xs text-slate-400">
                {def.source === 'beneficiaries'
                  ? 'כשתסיימו לבחור את המסננים, הציגו את הרשימה כדי לראות בדיוק למי נשלח'
                  : 'הציגו את הרשימה כדי לראות בדיוק למי נשלח'}
              </p>
              <button
                type="button"
                onClick={() => setShowList(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5
                           text-sm font-bold text-white transition hover:bg-indigo-700"
              >
                <Users size={15} /> הצג את רשימת הנמענים
              </button>
            </>
          )}
        </div>
      ) : (
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
      )}
    </div>
  )
}

// ── מודל יצירת קבוצה חדשה ──
// שתי דרכים למלא קבוצה: בחירת מקור מתוך המערכת, או העלאת קובץ CSV.
function NewGroupModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (id: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<'system' | 'file'>('system')
  const [name, setName] = useState('')
  const [source, setSource] = useState<FixedSource>('beneficiaries')

  // מונה הנמענים של המקור שנבחר.
  // התוצאה נושאת את המקור שממנו הגיעה — כך "טוען…" נגזר מההשוואה,
  // בלי setState סינכרוני בתוך ה-effect.
  const [preview, setPreview] = useState<{
    source: FixedSource
    count: number | null
    truncated: boolean
    recipients: { email: string; name: string; city: string }[]
  } | null>(null)
  const countReq = useRef(0)

  const ready = preview?.source === source
  const counting = !ready
  const count = ready ? preview.count : null
  const truncated = ready ? preview.truncated : false
  const recipients = ready ? preview.recipients : []

  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // תצוגה מקדימה של המקור — כמה נמענים ייכנסו לקבוצה
  useEffect(() => {
    if (tab !== 'system') return
    const id = ++countReq.current

    fetch('/api/admin/segments/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    })
      .then(r => r.json())
      .then((d: { total?: number; truncated?: boolean; recipients?: { email: string; name?: string; city?: string }[] }) => {
        if (id !== countReq.current) return
        const rows = (d.recipients ?? []).map(r => ({
          email: r.email,
          name: r.name ?? '',
          city: r.city ?? '',
        }))
        setPreview({
          source,
          count: typeof d.total === 'number' ? d.total : rows.length,
          truncated: Boolean(d.truncated),
          recipients: rows,
        })
      })
      .catch(() => {
        if (id !== countReq.current) return
        setPreview({ source, count: null, truncated: false, recipients: [] })
      })
    // כל הרצה מגדילה את countReq — לכן תשובה של בקשה ישנה נדחית בבדיקה שלמעלה,
    // ואין צורך ב-cleanup נפרד.
  }, [tab, source])

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) { setError('יש לתת שם לקבוצה'); return }

    setSaving(true)
    setError('')
    try {
      let res: Response

      if (tab === 'system') {
        if (!recipients.length) throw new Error('אין נמענים במקור שנבחר')
        res = await fetch('/api/admin/newsletter/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed, recipients }),
        })
      } else {
        if (!file) throw new Error('לא נבחר קובץ')
        const form = new FormData()
        form.append('file', file)
        form.append('name', trimmed)
        res = await fetch('/api/admin/newsletter/contacts', { method: 'POST', body: form })
      }

      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'יצירת הקבוצה נכשלה')

      await onCreated(d.listId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        dir="rtl"
        onClick={e => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">קבוצה חדשה</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              תנו שם לקבוצה, ובחרו כיצד למלא אותה
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="סגירה"
          >
            <X size={17} />
          </button>
        </div>

        {/* שם הקבוצה */}
        <label className="mb-1.5 block text-xs font-semibold text-slate-500">שם הקבוצה</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="לדוגמה: ירושלים"
          className="mb-5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm
                     focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />

        {/* טאבים */}
        <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
          {([
            ['system', 'בחירה מתוך המערכת'],
            ['file', 'העלאת קובץ'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setError('') }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                tab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'system' ? (
          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-500">מקור הנמענים</label>
            <div className="flex flex-col gap-1.5">
              {SOURCES.map(s => (
                <label
                  key={s.value}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 transition ${
                    source === s.value
                      ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="new-group-source"
                    checked={source === s.value}
                    onChange={() => setSource(s.value)}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <div>
                    <div className="text-sm font-bold text-slate-700">{s.label}</div>
                    <div className="text-xs text-slate-500">{s.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
              {counting ? (
                <>
                  <Loader2 size={15} className="animate-spin text-slate-400" />
                  <span className="text-sm text-slate-500">מחשב…</span>
                </>
              ) : (
                <>
                  <Users size={15} className="text-indigo-600" />
                  <span className="text-sm font-bold text-slate-800">
                    {(count ?? 0).toLocaleString('he-IL')} נמענים
                  </span>
                </>
              )}
            </div>

            {truncated && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                הקבוצה תיווצר עם {recipients.length.toLocaleString('he-IL')} הנמענים הראשונים בלבד.
              </p>
            )}

            <p className="mt-2 text-xs text-slate-400">
              אפשר לצמצם עם מסננים אחרי שתבחרו את הקבוצה
            </p>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              הורידו את קובץ הדוגמה, מלאו את הנמענים שלכם, והעלו אותו בחזרה.
              הקובץ חייב להכיל עמודת <strong>מייל</strong>; שאר העמודות (שם, עיר, טלפון)
              משמשות למשתני המיזוג ואינן חובה.
            </p>

            <div className="flex flex-wrap items-center gap-2">
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
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white
                           px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <Upload size={15} /> בחירת קובץ
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={e => { setFile(e.target.files?.[0] ?? null); setError('') }}
                className="hidden"
              />
            </div>

            {file && (
              <p className="mt-3 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                נבחר: <strong>{file.name}</strong>
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}

        <div className="mt-6 flex justify-start gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={create}
            disabled={saving || !name.trim() || (tab === 'file' ? !file : !count)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5
                       text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {saving ? 'יוצר…' : 'צור קבוצה'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold
                       text-slate-600 transition hover:bg-slate-50"
          >
            ביטול
          </button>
        </div>
      </div>
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
