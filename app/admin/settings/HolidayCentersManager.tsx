'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Loader2, MapPin, Plus, Pencil, Trash2, Check, X, Search } from 'lucide-react'
import { REGIONS, type RegionKey } from '@/lib/holidayCenterPick'

// ─────────────────────────────────────────────────────────────────────────────
// ניהול מוקדי החלוקה לחגים.
//
// 🔴 מאגר גלובלי שנשמר מחג לחג — נפרד לחלוטין מבתי ההחלמה ומ-card_centers
// של היולדות. אין ביניהם שום קשר.
//
// ⚠️ ניתן לעריכה תמיד, גם באמצע חלוקה פעילה: כתובת שהשתנתה חייבת להגיע
// לשובר שטרם נשלח.
// ─────────────────────────────────────────────────────────────────────────────

interface Center {
  id: string
  city: string
  name: string
  address: string | null
  phone: string | null
  hours: string | null
  region: string
  capacity: number | null
  is_active: boolean
  sort_order: number
}

const EMPTY: Omit<Center, 'id'> = {
  city: '', name: '', address: '', phone: '', hours: '',
  region: 'center', capacity: null, is_active: true, sort_order: 0,
}

export default function HolidayCentersManager() {
  const [centers, setCenters] = useState<Center[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  /** null = סגור · '' = הוספה חדשה · id = עריכה */
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<Center, 'id'>>(EMPTY)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/holiday-centers', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'הטעינה נכשלה')
      setCenters(d.centers ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
      setCenters([])
    }
  }, [])

  // ⚠️ פעם אחת בלבד — תלות ב-load שנוצר מחדש הייתה יורה שליפה בכל רינדור.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void load()
  }, [load])

  async function save() {
    if (!form.city.trim() || !form.name.trim()) { setErr('עיר ושם המוקד הם שדות חובה'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/holiday-centers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ...(editing ? { id: editing } : {}) }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'השמירה נכשלה'); return }
      setEditing(null); setForm(EMPTY)
      await load()
    } catch { setErr('שגיאת רשת') } finally { setBusy(false) }
  }

  async function remove(c: Center) {
    if (!confirm(`למחוק את המוקד "${c.name}" (${c.city})?`)) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/admin/holiday-centers?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'המחיקה נכשלה'); return }
      // ⚠️ מוקד שכבר נבחר מושבת ולא נמחק — נאמר למשתמש מה קרה בפועל.
      if (d.deactivated) {
        setErr(`המוקד הושבת ולא נמחק: ${d.recipients} משפחות כבר נרשמו אליו והשובר שלהן מצביע עליו`)
      }
      await load()
    } catch { setErr('שגיאת רשת') } finally { setBusy(false) }
  }

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q || !centers) return centers ?? []
    return centers.filter(c => `${c.city} ${c.name} ${c.address ?? ''}`.includes(q))
  }, [centers, query])

  const byRegion = useMemo(() => {
    const out: Record<string, Center[]> = { jerusalem: [], center: [], north: [], south: [] }
    for (const c of filtered) (out[c.region] ??= []).push(c)
    return out
  }, [filtered])

  if (centers === null) {
    return <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
      <Loader2 size={16} className="animate-spin" /> טוען מוקדים…
    </div>
  }

  const field = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200'

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-slate-500">
        מוקדי החלוקה לחגים — <strong>מאגר גלובלי</strong> שנשמר מחג לחג ואינו קשור
        לבתי ההחלמה של היולדות. בכל חלוקה בוחרים אילו מוקדים פתוחים, והמשפחות
        בוחרות מחדש בכל חג.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
          <Search size={15} className="flex-shrink-0 text-slate-400" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="חיפוש לפי עיר, שם או כתובת…"
            className="w-full bg-transparent text-sm placeholder:text-slate-400 focus:outline-none" />
          <span className="flex-shrink-0 text-xs text-slate-400">{filtered.length}</span>
        </div>
        <button type="button" onClick={() => { setEditing(''); setForm(EMPTY); setErr('') }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700">
          <Plus size={14} /> מוקד חדש
        </button>
      </div>

      {editing !== null && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
          <h4 className="mb-3 text-sm font-extrabold text-indigo-900">
            {editing ? 'עריכת מוקד' : 'מוקד חדש'}
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-600">עיר *</span>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-600">שם המוקד *</span>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="אזור נווה צבי" className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-600">כתובת</span>
              <input value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-600">טלפון</span>
              <input value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-600">ימים ושעות (מופיע בשובר)</span>
              <input value={form.hours ?? ''} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                placeholder="יום ג' 10:00–14:00" className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-600">אזור (לתפריט הטלפוני)</span>
              <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} className={field}>
                {(Object.keys(REGIONS) as RegionKey[]).map(k => (
                  <option key={k} value={k}>{REGIONS[k]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-600">תקרה (ריק = ללא הגבלה)</span>
              <input type="number" min={0} value={form.capacity ?? ''}
                onChange={e => setForm(f => ({ ...f, capacity: e.target.value === '' ? null : Number(e.target.value) }))}
                className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-600">סדר בתפריט</span>
              <input type="number" value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} className={field} />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={save} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} שמירה
            </button>
            <button type="button" onClick={() => { setEditing(null); setErr('') }}
              className="text-xs font-bold text-slate-500 hover:text-slate-700">ביטול</button>
          </div>
        </div>
      )}

      {(Object.keys(REGIONS) as RegionKey[]).map(rk => byRegion[rk]?.length ? (
        <div key={rk}>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
            <MapPin size={13} className="text-indigo-600" /> {REGIONS[rk]} ({byRegion[rk].length})
          </h4>
          <div className="flex flex-col gap-1.5">
            {byRegion[rk].map(c => (
              <div key={c.id}
                className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${
                  c.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'
                }`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {c.city === c.name ? c.city : `${c.city} · ${c.name}`}
                    {!c.is_active && <span className="mr-2 text-[11px] font-normal text-slate-400">(מושבת)</span>}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {[c.address, c.hours, c.capacity != null ? `תקרה ${c.capacity}` : null]
                      .filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <button type="button" title="עריכה"
                  onClick={() => { setEditing(c.id); setForm({ ...c }); setErr('') }}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-indigo-300 hover:text-indigo-700">
                  <Pencil size={13} />
                </button>
                <button type="button" title="מחיקה" onClick={() => remove(c)} disabled={busy}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:border-rose-300 hover:text-rose-600 disabled:opacity-40">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null)}

      {!filtered.length && (
        <p className="py-8 text-center text-sm text-slate-400">
          {query ? 'לא נמצאו מוקדים התואמים לחיפוש' : 'טרם הוגדרו מוקדים'}
        </p>
      )}

      {err && (
        <p className="flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <X size={15} className="mt-0.5 flex-shrink-0" /> {err}
        </p>
      )}
    </div>
  )
}
