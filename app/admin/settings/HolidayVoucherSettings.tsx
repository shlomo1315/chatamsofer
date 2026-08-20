'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Eye, Check, X, FileText, Plus, Trash2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// עיצוב ומלל שובר החלוקה.
//
// 🔴 יושב בהגדרות ולא במסך חלוקה מסוימת: השובר כללי לכל סוגי החלוקות,
// והמלל נקבע פעם אחת ומשמש את כולן. עריכה במסך של חלוקה בודדת הייתה
// מרמזת שכל חלוקה מקבלת נוסח משלה.
//
// ⚠️ התצוגה המקדימה אינה שולחת דבר — היא מייצרת PDF ומציגה אותו.
// ─────────────────────────────────────────────────────────────────────────────

interface Texts {
  title: string
  intro: string
  instructions: string[]
  footer: string
}

export default function HolidayVoucherSettings() {
  const [texts, setTexts] = useState<Texts | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/holiday-voucher/texts', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'הטעינה נכשלה')
      setTexts(d.texts)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
    }
  }, [])

  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void load()
  }, [load])

  async function save() {
    if (!texts) return
    setBusy(true); setErr(''); setDone('')
    try {
      const res = await fetch('/api/admin/holiday-voucher/texts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'השמירה נכשלה'); return }
      setDone('נשמר')
    } catch { setErr('שגיאת רשת') } finally { setBusy(false) }
  }

  if (!texts) {
    return <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
      <Loader2 size={16} className="animate-spin" /> טוען…
    </div>
  }

  const field = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200'
  const set = (patch: Partial<Texts>) => { setTexts({ ...texts, ...patch }); setDone('') }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-slate-500">
        המלל שמופיע על שובר החלוקה. <strong className="text-slate-700">כללי לכל סוגי החלוקות</strong> —
        המוקד, הכתובת והשעות נלקחים אוטומטית מהמוקד שהמשפחה בחרה.
      </p>

      <a href="/api/admin/holiday-voucher/preview" target="_blank" rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-teal-300 bg-white px-3 py-2 text-xs font-bold text-teal-800 hover:bg-teal-50">
        <Eye size={13} /> תצוגה מקדימה של השובר
      </a>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-slate-600">כותרת השובר</span>
        <input value={texts.title} onChange={e => set({ title: e.target.value })} className={field} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-slate-600">פסקת פתיחה</span>
        <textarea value={texts.intro} onChange={e => set({ intro: e.target.value })}
          rows={3} className={`${field} resize-y`} />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-slate-600">הוראות (ממוספרות אוטומטית)</span>
        {texts.instructions.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-4 flex-shrink-0 text-[11px] text-slate-400">{i + 1}.</span>
            <input value={line} className={field}
              onChange={e => {
                const next = [...texts.instructions]
                next[i] = e.target.value
                set({ instructions: next })
              }} />
            <button type="button" title="הסרה"
              onClick={() => set({ instructions: texts.instructions.filter((_, j) => j !== i) })}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:border-rose-300 hover:text-rose-600">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => set({ instructions: [...texts.instructions, ''] })}
          className="mt-1 flex w-fit items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-800">
          <Plus size={13} /> הוספת שורה
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-slate-600">שורת סיום</span>
        <input value={texts.footer} onChange={e => set({ footer: e.target.value })} className={field} />
      </label>

      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-40">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} שמירה
        </button>
        {done && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={13} /> {done}</span>}
      </div>

      {err && (
        <p className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <X size={15} /> {err}
        </p>
      )}
    </div>
  )
}
